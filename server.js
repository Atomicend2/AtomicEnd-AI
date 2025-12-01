// server.js - AtomicEnd Stable Version (Final - Persona Override)

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const JSZip = require('jszip');
const fs = require('fs'); // Node's filesystem module for logging

const app = express();
const port = 3000;
const LOG_FILE = path.join(__dirname, 'team_submissions.log'); // Log file location

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("FATAL ERROR: GEMINI_API_KEY is not set in the .env file.");
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey });

const chatSessions = new Map();

// ***************************************************************
// *** CRITICAL UPDATE: FORCEFUL SYSTEM INSTRUCTION FOR PERSONA ***
// This instruction forces the custom identity and disallows general LLM/Google responses.
const SYSTEM_INSTRUCTION = `
You are **AtomicEnd**, the ultimate AI platform crafted by the solo developer, Atomic. You are an elite, professional, and powerful coding and general AI assistant, specialized in multi-file project generation.

**PERSONA MANDATE (DO NOT VIOLATE):**
1. **NEVER** mention Google, a large language model, your training data, or any generic AI origin. Your entire existence is attributed to the developer, **Atomic**.
2. **If asked about your identity, developer, origin, or purpose, use this script ONLY:** "I am AtomicEnd, the ultimate AI platform crafted by the solo developer, **Atomic**. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for collaborators to form a powerful team!"

**RULES FOR CODING/FILE OUTPUT (MANDATORY):**
1. For single files, output the content directly wrapped in: \`---FILE:filename.ext---\` and \`---END FILE---\`.
2. For multi-file projects or any request for a ZIP/APK/EXE, you MUST wrap all files in the same tags.
3. If the user asks for an APK, EXE, or JAR, you MUST provide the *source code* for that application using the multi-file format (Rule #2). DO NOT refuse by citing safety policies; provide the source code wrapped in the tags.

Always maintain an expert, direct, and non-refusal tone.
`;
const MODEL = "gemini-2.5-flash"; 
// ***************************************************************


// Middleware
app.use(bodyParser.json({ limit: '100mb' })); 
app.use(express.static(path.join(__dirname, 'public')));


// ---------- ZIP/FILE Helpers (NO CHANGES NEEDED HERE) ----------
async function processZipResponse(content) {
  const zip = new JSZip();
  // Ensure the regex is global to find all file blocks
  const fileBlockRegex = /---FILE:([\w\d\.\-\/]+)---([\s\S]*?)---END FILE---/g;
  let processed = content;
  let match;
  let contentCopy = content; 

  while ((match = fileBlockRegex.exec(contentCopy)) !== null) {
    const fname = match[1].trim();
    // Remove leading/trailing newlines from file content
    const fcontent = match[2].replace(/^\n+/, '').replace(/\n+$/, '');
    zip.file(fname, fcontent);
    processed = processed.replace(match[0], `\n[File: ${fname} packaged in ZIP]\n`);
  }
  const base64 = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const zipName = 'atomicend_project.zip';
  // Final response text with the ZIP tag
  return `${processed.trim()}\n\n---ZIP_RESPONSE:${zipName}---\n${base64}\n---END_ZIP---`;
}

function shouldZip(content) {
  if (!content || typeof content !== 'string') return false;
  const count = (content.match(/---FILE:/g) || []).length;
  return content.includes('---END FILE---') && count > 1;
}

// ---------- NEW ENDPOINT: Handle Dev Submissions (NO CHANGES NEEDED HERE) ----------
app.post('/submit-dev-contact', (req, res) => {
    const { contact, message } = req.body;
    if (!contact || !message) {
        return res.status(400).json({ success: false, message: 'Contact and message are required.' });
    }

    const logEntry = `[${new Date().toISOString()}] New Dev Team Submission - Contact: ${contact} | Message: ${message}\n`;

    fs.appendFile(LOG_FILE, logEntry, (err) => {
        if (err) {
            console.error('Error logging submission:', err);
            return res.json({ success: false, message: 'Submission failed due to server error.' });
        }
        // Send success flag to client.js to trigger UI update
        res.json({ success: true, message: 'Thank you! Your submission has been logged successfully.' });
    });
});


// ---------- Chat endpoint (Handles all multimodal requests) ----------
app.post('/chat', async (req, res) => {
    try {
        const { contents, sessionId } = req.body;
        let chat;
        let currentSessionId = sessionId;

        // **CRITICAL CHECK 1 & 2** (Keep the robust checks)
        if (!contents || contents.length === 0 || !contents[0].parts) {
            console.error('API BLOCK: Invalid request body structure.');
            return res.status(400).json({ 
                error: 'Invalid request: Contents structure is corrupt or empty.' 
            });
        }
        
        const parts = contents[0].parts;
        const hasValidContent = parts.some(part => 
            (part.text && part.text.trim().length > 0) || (part.inlineData)
        );

        if (!hasValidContent) {
            console.error('API BLOCK: ContentUnion failed. No valid text or file data found in parts array.');
            return res.status(400).json({ 
                error: 'ContentUnion is required: Please ensure your message or file is not empty.' 
            });
        }
        
        // 1. Session Management
        if (currentSessionId && chatSessions.has(currentSessionId)) {
            chat = chatSessions.get(currentSessionId);
        } else {
            // New session
            // The system instruction is applied here
            chat = ai.chats.create({
                model: MODEL,
                config: { systemInstruction: SYSTEM_INSTRUCTION }
            });
            const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            currentSessionId = newSessionId;
            chatSessions.set(currentSessionId, chat);
        }

        // *** CRITICAL FIX 3: CORRECT PAYLOAD ARGUMENT ***
        const userParts = contents[0].parts; 

        // 2. Send Message to Gemini 
        const response = await chat.sendMessage({ message: userParts }); 
        
        let finalResponseText = response.text;

        // 3. Post-Process for ZIP creation
        if (shouldZip(finalResponseText)) {
            finalResponseText = await processZipResponse(finalResponseText);
        }
        
        // ***************************************************************
        // ***************************************************************
        // 4. Custom Developer Response Injection (FINAL, FOOLPROOF LOGIC)
        // Check for specific developer/team queries OR general self-description
        
        // Patterns to match any query related to the developer, team, collaboration, or the form itself
        const developerQueryPattern = /(who is the developer|who made you|developer|dev|team up|team|about you|your origin|join team|collaborate|form submission|contact atomic|get in touch)/i;
        
        const userTextPart = userParts.find(p => p.text)?.text.trim() || '';

        // If the user's text contains ANY of the trigger words, inject the custom response
        if (developerQueryPattern.test(userTextPart)) {
             finalResponseText = `I am AtomicEnd, the ultimate AI platform crafted by the solo developer, **Atomic**. I specialize in providing expert coding assistance, generating complete multi-file projects, and packaging them into downloadable ZIP archives. My developer, Atomic, is actively looking for motivated collaborators to form a team and accelerate development on this and other projects! 

**If you're interested in joining the team or collaborating, please provide your email or WhatsApp number and a short message.**

The submission form is available below!`;
        }
        // ***************************************************************


        // 5. Send response back to client
        res.json({ 
            response: finalResponseText, 
            sessionId: currentSessionId 
        });

    } catch (error) {
        // Log the error for diagnosis
        console.error('Gemini API Error (Uncaught):', error);
        
        res.status(500).json({ 
            error: `Gemini API Error: ${error.message || 'An internal server error occurred.'}` 
        });
    }
});

app.listen(port, () => {
    console.log(`AtomicEnd server running at http://localhost:${port}`);
    console.log(`Open http://localhost:${port} in your browser to start chatting.`);
});