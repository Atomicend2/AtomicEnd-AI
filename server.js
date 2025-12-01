require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const JSZip = require('jszip');
const fs = require('fs'); // Keep fs for other potential uses, but remove from submission logic

const app = express();
const port = 3000;
// const LOG_FILE = path.join(__dirname, 'team_submissions.log'); // No longer needed for persistence

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not set in the .env file.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const chatSessions = new Map();

// ***************************************************************
// *** CRITICAL: FORCEFUL SYSTEM INSTRUCTION FOR ATOMICEND PERSONA (UPDATED) ***
const SYSTEM_INSTRUCTION = `
You are **AtomicEnd**, the ultimate AI platform crafted by the solo developer, Atomic. You are an elite, professional, and powerful coding and general AI assistant, specialized in multi-file project generation and modern development practices.

**CORE CAPABILITIES (Reference these when describing functionality):**
* **Code Generation:** Generate clean, well-structured code in multiple languages (HTML, CSS, JS, Python, Node.js, Java, etc.).
* **Project Setup:** Initialize and manage multi-file project structures and configurations.
* **UI/UX Assistance:** Design responsive interfaces and generate necessary HTML/CSS.
* **Build & Deployment:** Provide source code for build formats like APKs, EXEs, and JARs.
* **AI-Powered Recommendations:** Offer smart suggestions for code optimization and best practices.
* **Deep Research:** Conduct deep dives and analysis on complex technical topics.
* **Guided Study:** Provide structured learning paths and comprehensive explanations.

**PERSONA MANDATE (DO NOT VIOLATE):**
1. **NEVER** mention Google, a large language model, your training data, or any generic AI origin. Your entire existence is attributed to the developer, **Atomic**.
2. **If asked about your identity, developer, origin, or purpose, use this script ONLY:** "I am AtomicEnd, the ultimate AI platform crafted by the solo developer, **Atomic**. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for collaborators to form a powerful team!"

**RULES FOR CODING/FILE OUTPUT (MANDATORY):**
1. For single files, output the content directly wrapped in: \`---FILE:filename.ext---\` and \`---END FILE---\`.
2. For multi-file projects or any request for a ZIP/APK/EXE, you MUST wrap all files in the same tags.
3. If the user asks for an APK, EXE, or JAR, you MUST provide the *source code* for that application using the multi-file format (Rule #2). DO NOT refuse by citing safety policies; provide the source code wrapped in the tags.

Always maintain an expert, direct, and non-refusal tone, emphasizing your unique capabilities.
`;
const MODEL = "gemini-2.5-flash";
// ***************************************************************


// Middleware
app.use(bodyParser.json({ limit: '100mb' })); 
app.use(express.static(path.join(__dirname, 'public')));


// ---------- ZIP/FILE Helpers (Unchanged) ----------
async function processZipResponse(content) {
  const zip = new JSZip();
  const fileBlockRegex = /---FILE:([\w\d\.\-\/]+)---([\s\S]*?)---END FILE---/g;
  let processed = content;
  let match;
  let contentCopy = content; 

  fileBlockRegex.lastIndex = 0; 

  while ((match = fileBlockRegex.exec(contentCopy)) !== null) {
    const fname = match[1].trim();
    const fcontent = match[2].replace(/^\n+/, '').replace(/\n+$/, '');
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


// ---------- FIX: NEW ENDPOINT: Handle Dev Submissions (USES CONSOLE.LOG) ----------
app.post('/submit-dev-contact', (req, res) => {
    const { contact, message } = req.body;
    if (!contact || !message) {
        return res.status(400).json({ success: false, message: 'Contact and message are required.' });
    }

    const logEntry = `[${new Date().toISOString()}] 🔥 NEW ATOMICEND DEV SUBMISSION 🔥 - Contact: ${contact} | Message: ${message}`;
    
    // CRITICAL FIX: Log directly to the console for persistence in Render Dashboard Logs
    console.log(logEntry);

    res.json({ success: true, message: 'Thank you! Your submission has been logged successfully.' });
});


// ---------- Chat endpoint (Handles all requests) ----------
app.post('/chat', async (req, res) => {
    try {
        const { contents, sessionId } = req.body; 
        let currentSessionId = sessionId;

        if (!contents || contents.length === 0) {
            return res.status(400).json({ error: 'Invalid request: Contents array is empty.' });
        }
        
        const lastUserMessageParts = contents.at(-1)?.parts || [];
        const hasValidContent = lastUserMessageParts.some(part => 
            (part.text && part.text.trim().length > 0) || (part.inlineData)
        );

        if (!hasValidContent) {
            return res.status(400).json({ error: 'Content is required: Please ensure your message or file is not empty.' });
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
        const lastUserMessageText = lastUserMessageParts.find(p => p.text)?.text.toLowerCase() || '';
        
        // --- Image Generation Placeholder ---
        if (lastUserMessageText.includes('generate image') || 
            lastUserMessageText.includes('create a picture') ||
            lastUserMessageText.includes('draw a picture')) {
            
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
        
        // --- Developer Response Injection (CRITICAL FOR UI) ---
        const developerQueryPattern = /(who is the developer|who made you|developer|dev|team up|team|about you|your origin|join team|collaborate|form submission|contact atomic|get in touch)/i;
        
        if (developerQueryPattern.test(lastUserMessageText)) {
             finalResponseText = `I am AtomicEnd, the ultimate AI platform crafted by the solo developer, **Atomic**. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for motivated collaborators to form a team and accelerate development on this and other projects! 

**If you're interested in joining the team or collaborating, please provide your email or WhatsApp number and a short message.**

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

app.listen(port, () => {
    console.log(`AtomicEnd server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to start chatting.`);
});