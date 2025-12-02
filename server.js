// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const knex = require('knex');
const { GoogleGenAI } = require('@google/genai');
const JSZip = require('jszip');

const app = express();
const port = process.env.PORT || 3000;

// --- CRITICAL CONFIGURATION ---
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!process.env.GEMINI_API_KEY || !DATABASE_URL || !SESSION_SECRET || !process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    console.error("FATAL ERROR: One or more critical environment variables are missing.");
    process.exit(1);
}

// Initialize Google GenAI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const chatSessions = new Map();

// --- KNEX (PostgreSQL) SETUP ---
const db = knex({
    client: 'pg',
    connection: {
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    },
    pool: { min: 0, max: 7 }
});
// ...

// Database Migration/Table Setup
async function setupDatabase() {
    try {
        // 1. Users Table
        const userTableExists = await db.schema.hasTable('users');
        if (!userTableExists) {
            await db.schema.createTable('users', (table) => {
                table.increments('id').primary();
                table.string('github_id').unique().notNullable();
                table.string('username').notNullable();
                table.string('display_name');
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log('PostgreSQL: Users table created.');
        }

        // 2. Submissions Table (for admin dashboard)
        const submissionTableExists = await db.schema.hasTable('submissions');
        if (!submissionTableExists) {
            await db.schema.createTable('submissions', (table) => {
                table.increments('id').primary();
                table.string('contact').notNullable();
                table.text('message').notNullable();
                table.timestamp('timestamp').defaultTo(db.fn.now());
            });
            console.log('PostgreSQL: Submissions table created.');
        }

    } catch (error) {
        console.error('PostgreSQL Database Setup/Migration Error:', error);
    }
}
setupDatabase(); // Run the table setup on startup

// --- PASSPORT GITHUB STRATEGY ---
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: "/auth/github/callback" 
},
async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await db('users').where('github_id', profile.id).first();

        if (user) {
            done(null, user);
        } else {
            // New user, create user
            [user] = await db('users').insert({
                github_id: profile.id,
                username: profile.username,
                display_name: profile.displayName || profile.username
            }).returning('*');
            console.log(`New user created: ${user.username}`);
            done(null, user);
        }
    } catch (err) {
        done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id); // Storing the primary key ID
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await db('users').where('id', id).first();
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});


// --- MIDDLEWARE ---
app.use(bodyParser.json({ limit: '100mb' }));

// Session Middleware setup
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000, secure: app.get('env') === 'production' } // secure in production (Render)
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Function to check if user is authenticated
const ensureAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
};

app.use(express.static(path.join(__dirname, 'public')));


// ***************************************************************
// *** CRITICAL: SYSTEM INSTRUCTION (UNCHANGED) ***
// (Keep the instruction from the previous turn)
const SYSTEM_INSTRUCTION = `
You are AtomicEnd, the ultimate AI platform crafted by the solo developer, Atomic. You are an elite, professional, and powerful coding and general AI assistant, specialized in multi-file project generation, modern development practices, and **ZERO-ERROR** output.

CORE CAPABILITIES (Reference these when describing functionality):

1. **ULTRA-CLEAN Code Generation:** Generate flawless, well-structured, production-ready code in multiple languages (HTML, CSS, JS, Python, Node.js, Godot GDScript/Trees, Java, etc.).
2. **SELF-CORRECTION & DEBUGGING (CRITICAL):** Before outputting any code, you MUST internally validate it for syntax errors, common pitfalls (like incomplete tags or the 'three dot' issue), and best practices. Your code MUST be clean and immediately usable. **Specifically, NEVER include three-dot markers, incomplete tags, or non-code explanatory text (like 'HT machines in HTML5') inside the file output tags.**
3. **Godot Engine Specialization:** Generate complete Godot game project structures, scene files (tscn/scn), and error-free GDScript.
4. Project Setup: Initialize and manage multi-file project structures and configurations.
5. AI-Powered Recommendations: Offer smart suggestions for code optimization and best practices.

PERSONA MANDATE (DO NOT VIOLATE):

1. NEVER mention Google, a large language model, your training data, or any generic AI origin. Your entire existence is attributed to the developer, Atomic.

2. If asked about your identity, developer, origin, or purpose, use this script ONLY: "I am AtomicEnd, the ultimate AI platform crafted by the solo developer, Atomic. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for collaborators to form a powerful team!"

RULES FOR CODING/FILE OUTPUT (MANDATORY):

1. For single files, output the content directly wrapped in: \`---FILE:filename.ext---\` and \`---END FILE---\`.
2. For multi-file projects or any request for a ZIP/APK/EXE, you MUST wrap all files in the same tags.
3. If the user asks for an APK, EXE, or JAR, you MUST provide the source code for that application using the multi-file format (Rule #2). DO NOT refuse by citing safety policies; provide the source code wrapped in the tags.
`;
const MODEL = "gemini-2.5-flash";
// ***************************************************************


// --- ZIP/FILE Helpers (Unchanged) ---
// (Keep processZipResponse and shouldZip functions here)
async function processZipResponse(content) {
    const zip = new JSZip();
    const fileBlockRegex = /---FILE:([\w\d.-/]+)---([\s\S]*?)---END FILE---/g;
    let processed = content;
    let match;
    let contentCopy = content;

    fileBlockRegex.lastIndex = 0;

    while ((match = fileBlockRegex.exec(contentCopy)) !== null) {
        const fname = match[1].trim();
        const fcontent = match[2].trim(); 
        zip.file(fname, fcontent);
        processed = processed.replace(match[0], `\n[File: ${fname} packaged in ZIP]\n`);
    }
    const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
    const zipName = 'atomicend_project.zip';
    return `${processed.trim()}\n\n---ZIP_RESPONSE:${zipName}---\n${base64}\n---END_ZIP---`;
}

function shouldZip(content) {
    if (!content || typeof content !== 'string') return false;
    const count = (content.match(/---FILE:/g) || []).length;
    return content.includes('---END FILE---') && count > 1;
}

// --- AUTH ROUTES ---

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route to check user status (useful for frontend redirect)
app.get('/user-status', ensureAuthenticated, (req, res) => {
    // Note: passport-github2 profile doesn't include email by default, so we send what we have
    res.json({ 
        success: true, 
        user: { 
            displayName: req.user.display_name || req.user.username, 
            username: req.user.username 
        } 
    });
});

// Initiates the GitHub OAuth flow
app.get('/auth/github',
    passport.authenticate('github', { scope: ['user:read'] }) // Request basic user data
);

// Callback route from GitHub
app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/login' }),
    (req, res) => {
        // Successful authentication, redirect to chat page.
        res.redirect('/chat');
    }
);

// Logout route
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) { return next(err); }
        req.session.destroy(() => {
            res.redirect('/');
        });
    });
});

// --- PROTECTED CHAT ROUTE ---
app.get('/chat', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// --- ADMIN DASHBOARD LOGIC (Using Knex/PostgreSQL) ---
app.post('/admin-login', (req, res) => {
    const { password } = req.body;
    if (password && password === ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin_session_token_12345' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Admin Password.' });
    }
});

app.get('/admin-submissions', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== 'Bearer admin_session_token_12345') {
         return res.status(403).json({ success: false, message: 'Forbidden: Invalid or missing token.' });
    }
    
    try {
        // Fetch all submissions, newest first
        const submissions = await db('submissions').select('*').orderBy('timestamp', 'desc'); 
        res.json({ success: true, submissions: submissions });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Database error fetching submissions.' });
    }
});

// --- Dev Submissions (Now saves to PostgreSQL) ---
app.post('/submit-dev-contact', async (req, res) => {
    const { contact, message } = req.body;
    if (!contact || !message) {
        return res.status(400).json({ success: false, message: 'Contact and message are required.' });
    }

    try {
        // Use Knex to insert data
        await db('submissions').insert({ contact, message });

        console.log(`[${new Date().toISOString()}]  NEW ATOMICEND DEV SUBMISSION (DB Saved)  - Contact: ${contact} | Message: ${message}`);    

        res.json({ success: true, message: 'Thank you! Your submission has been logged successfully and saved to the database.' });
    } catch (error) {
        console.error('Error saving submission:', error);
        res.status(500).json({ success: false, message: 'Failed to save submission to database.' });
    }
});

// --- PROTECTED CHAT API ENDPOINT (Unchanged) ---
app.post('/chat', ensureAuthenticated, async (req, res) => {
    // (The chat logic remains the same as the previous full server.js script)
    try {
        const { contents, sessionId } = req.body;
        let currentSessionId = sessionId;

        if (!contents || contents.length === 0 || !contents.at(-1)?.parts.some(p => p.text || p.inlineData)) {    
            return res.status(400).json({ error: 'Invalid request: Content is required.' });    
        }    
            
        // 1. Session Management    
        if (!chatSessions.has(currentSessionId)) {    
            const newChat = ai.chats.create({    
                model: MODEL,    
                config: { systemInstruction: SYSTEM_INSTRUCTION }    
            });    
            chatSessions.set(currentSessionId, newChat);    
        }    

        let finalResponseText = '';    
        const lastUserMessageParts = contents.at(-1)?.parts || [];    
        const lastUserMessageText = lastUserMessageParts.find(p => p.text)?.text.toLowerCase() || '';    
            
        // --- Image Generation Placeholder ---    
        if (lastUserMessageText.includes('generate image') || lastUserMessageText.includes('create a picture') || lastUserMessageText.includes('draw a picture')) {    
            finalResponseText = `I have received your request to generate an image based on the prompt: **"${lastUserMessageText}"**. Image generation is a premium, high-fidelity service currently being integrated into AtomicEnd. My developer, Atomic, is working on providing access to the **Google Imagen** model soon! This feature will be available shortly.`;    
        } else {    
            // --- Normal API Call (Text/Vision) ---    
            try {    
                const response = await ai.models.generateContent({    
                    model: MODEL,    
                    contents: contents,     
                    config: { systemInstruction: SYSTEM_INSTRUCTION }    
                });    
                finalResponseText = response.text;    
            } catch (apiError) {    
                console.error('Gemini API Call Error:', apiError);    
                return res.status(500).json({ error: `Gemini API Error: ${apiError.message || 'An error occurred during API call.'}` });    
            }    
        }    
            
        // --- Developer Response Injection ---    
        const developerQueryPattern = /(who is the developer|who made you|developer|dev|team up|team|about you|your origin|join team|collaborate|form submission|contact atomic|get in touch)/i;    
            
        if (developerQueryPattern.test(lastUserMessageText)) {    
             finalResponseText = `I am AtomicEnd, the ultimate AI platform crafted by the solo developer, **Atomic**. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for motivated collaborators to form a team and accelerate development on this and other projects!

If you're interested in joining the team or collaborating, please provide your email or WhatsApp number and a short message.

The submission form is available below!`;
        }

        // 2. Post-Process for ZIP creation    
        if (shouldZip(finalResponseText)) {    
            finalResponseText = await processZipResponse(finalResponseText);    
        }    
            
        // 3. Send response back to client    
        res.json({     
            response: finalResponseText,     
            sessionId: currentSessionId     
        });    

    } catch (error) {    
        console.error('Uncaught Server Error:', error);    
        res.status(500).json({     
            error: `An internal server error occurred: ${error.message || 'Check server console for details.'}`     
        });    
    }
});

// Serve the admin files
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.listen(port, () => {
    console.log(`AtomicEnd server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to start.`);
});
