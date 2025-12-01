// client.js - AtomicEnd Multimodal UI logic (FINALIZED FOR MOBILE DEPLOYMENT)

const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const recordBtn = document.getElementById('recordBtn');
const fileInput = document.getElementById('fileInput');
const chooseFileBtn = document.getElementById('chooseFileBtn'); 
const devFormContainer = document.getElementById('devFormContainer');
const devSubmitBtn = document.getElementById('devSubmitBtn');
const devContactInput = document.getElementById('devContactInput');
const devMessageInput = document.getElementById('devMessageInput');

let sessionId = null;
let uploadedFileBase64 = null; 
let uploadedFileMimeType = null;
let recognizing = false;
let recognition = null;

// ***************************************************************
// *** CRITICAL MOBILE DEPLOYMENT SETTING FOR RENDER ***
// Render will handle routing the base URL to our server, 
// so we use the simple relative path.
const CHAT_ENDPOINT = '/chat'; 
// ***************************************************************


// --- Utility Functions ---

function escapeHtml(s){ 
    return String(s).replace(/[&<>"']/g, (m)=>({ 
        '&':'&amp;',
        '<':'&lt;',
        '>':'&gt;',
        '"':'&quot;',
        "'":'&#39;' 
    })[m]); 
}

// *** UPDATED markdownToHtml for Copyable Code Blocks ***
function markdownToHtml(rawText) {
    let html = escapeHtml(rawText);

    // 1. Line Breaks (MUST be done first for markdown processing)
    html = html.replace(/\n/g, '<br>');

    // 2. Code Blocks (Use a more specific pattern for content inside)
    html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        // Remove the initial <br> that comes from the line break replacement if code starts on a new line
        codeContent = codeContent.replace(/^<br>/, '');
        // The resulting HTML is wrapped in a dedicated container for styling and copy button
        return `<div class="code-container"><pre><code class="copyable-code">${codeContent}</code></pre></div>`;
    });

    // 3. Basic Markdown: Bold and Italics
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // 4. Handle ZIP Download Tags
    const ZIP_START_TAG = /---ZIP_RESPONSE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END_ZIP---/;
    let zipMatch;
    if (zipMatch = html.match(ZIP_START_TAG)) {
        const fileName = zipMatch[1];
        const base64Data = zipMatch[2].replace(/<br>/g, '');
        
        const buttonHtml = `
            <a href="#" onclick="downloadBase64File('${base64Data}', '${fileName}', 'application/zip'); return false;" 
                class="download-btn zip-download-btn">
                💾 Download ${fileName}
            </a>
        `;
        html = html.replace(zipMatch[0], buttonHtml);
    }
    
    // 5. Handle Single File Download Tags
    const FILE_START_TAG = /---FILE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END FILE---/;
    let fileMatch;
    if (fileMatch = html.match(FILE_START_TAG)) {
        const fileName = fileMatch[1];
        const fileContent = fileMatch[2].replace(/<br>/g, '\n');
        
        const buttonHtml = `
            <a href="#" onclick="downloadFileContent('${fileContent}', '${fileName}', 'text/plain'); return false;" 
                class="download-btn file-download-btn">
                ⬇️ Download ${fileName}
            </a>
        `;
        html = html.replace(fileMatch[0], buttonHtml);
    }

    return html;
}

// Global utility for downloading Base64 content
window.downloadBase64File = (base64, filename, mimeType) => {
    const link = document.createElement('a');
    link.href = 'data:' + mimeType + ';base64,' + base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Global utility for downloading text content
window.downloadFileContent = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Helper to append messages to the chat window
function appendMessage(role, html) {
  const div = document.createElement('div')
  div.className = `msg ${role}`;
  div.innerHTML = html;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

// *** FINAL CORRECTED typeWriter function ***
async function typeWriter(el, htmlContent, speed = 12) {
    // 1. Hide the submission form while the AI talks
    devFormContainer.style.display = 'none';

    el.innerHTML = ''; 
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    // Get the full plain text content for the typing effect
    const fullText = tempDiv.textContent; 

    // 2. Typing Effect
    for (let i = 0; i < fullText.length; i++) {
        el.textContent = fullText.substring(0, i + 1);
        if (i % 3 === 0) await new Promise(r => setTimeout(r, speed));
    }
    
    // 3. Final Render (Crucial for markdown/buttons)
    el.innerHTML = htmlContent;

    // 4. CRITICAL FIX: Robust Check for Developer Response Trigger
    const finalRenderedText = fullText.toLowerCase(); 

    if (finalRenderedText.includes('interested in joining the team') || finalRenderedText.includes('submission form is available below') || finalRenderedText.includes('provide your email or whatsapp number')) {
        // Show the form
        devFormContainer.style.display = 'flex';
        // Scroll to the bottom to ensure the form is visible
        chatEl.scrollTop = chatEl.scrollHeight;
    }
}

// --- File Handling ---

chooseFileBtn.onclick = () => {
    fileInput.click();
};

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            uploadedFileBase64 = event.target.result.split(',')[1];
            uploadedFileMimeType = file.type;
            
            // Update button to show file is ready
            chooseFileBtn.textContent = `File Ready: ${file.name}`;
            chooseFileBtn.classList.add('file-ready');
        };
        reader.readAsDataURL(file);
    }
};

// --- Main Chat Logic ---

async function submitChat(message) {
    // Hide form on submission
    devFormContainer.style.display = 'none'; 

    let userMessageHtml = escapeHtml(message);
    if (uploadedFileBase64) {
        userMessageHtml += `<br><em>[File: ${uploadedFileMimeType} attached]</em>`;
    }
    appendMessage('user', userMessageHtml);

    const partsArray = [];

    if (uploadedFileBase64) {
        partsArray.push({
            inlineData: {
                data: uploadedFileBase64,
                mimeType: uploadedFileMimeType
            }
        });
    }

    let textPrompt = message.trim();
    if (textPrompt.length === 0 && uploadedFileBase64) {
        textPrompt = `Analyze this file and provide a detailed response or a coding project based on its content/context.`;
    } else if (textPrompt.length === 0) {
        appendMessage('ai', '❌ Error: Please provide a non-empty message.');
        return;
    }

    partsArray.push({ text: textPrompt });

    const body = {
        contents: [{ role: 'user', parts: partsArray }],
        sessionId: sessionId 
    };

    inputEl.value = '';
    uploadedFileBase64 = null;
    uploadedFileMimeType = null;
    chooseFileBtn.textContent = 'Choose File';
    chooseFileBtn.classList.remove('file-ready');

    const aiDiv = appendMessage('ai', '<span class="typing">...</span>');
    const span = aiDiv.querySelector('span');
    span.textContent = 'AtomicEnd is processing...';

    try {
        // *** USING RELATIVE PATH FOR RENDER DEPLOYMENT ***
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Server returned an error.');
        }

        const data = await response.json();
        sessionId = data.sessionId;

        span.textContent = ''; 
        const finalHtml = markdownToHtml(data.response);
        await typeWriter(span, finalHtml, 12);

    } catch (error) {
        span.textContent = `❌ Error: ${error.message}`;
        console.error('Chat submission error:', error);
    }
}

// --- Developer Submission Logic ---
devSubmitBtn.onclick = async () => {
    const contact = devContactInput.value.trim();
    const message = devMessageInput.value.trim();

    if (contact.length < 5 || message.length < 10) {
        alert("Please provide a valid contact (email/number) and a short message (min 10 characters).");
        return;
    }
    
    // Clear the form elements immediately
    devContactInput.value = '';
    devMessageInput.value = '';

    const statusDiv = appendMessage('ai', 'Submitting contact...');
    
    try {
        // We assume the submit endpoint is on the same host (Render)
        const response = await fetch('/submit-dev-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact, message })
        });
        
        const data = await response.json();

        // Update the status message
        if (data.success) {
            statusDiv.innerHTML = '✅ **Success!** Your contact information has been logged. The developer will reach out soon.';
        } else {
            statusDiv.innerHTML = `❌ Submission Failed: ${data.message || 'Check server logs.'}`;
        }
    } catch (error) {
        statusDiv.innerHTML = `❌ Network Error: Could not reach server.`;
        console.error('Submission error:', error);
    } finally {
        // Hide the form after submission attempt
        devFormContainer.style.display = 'none';
    }
};


// --- Event Listeners ---

sendBtn.onclick = () => {
    submitChat(inputEl.value.trim());
};

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// ---------------- Voice recording via Web Speech API ----------------
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  // (Recognition setup remains the same)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognizing = true;
    recordBtn.textContent = '🔴 Recording...';
    recordBtn.style.opacity = "0.85";
  };

  recognition.onend = () => {
    recognizing = false;
    recordBtn.textContent = '🎙️ Record';
    recordBtn.style.opacity = "1";
  };

  recognition.onerror = (e) => {
    recognizing = false;
    recordBtn.textContent = '🎙️ Record';
    console.error('Speech recognition error:', e.error || e.message);
  };

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    submitChat(transcript); 
  };

  recordBtn.onclick = () => {
    if (recognizing) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (err) {
      console.warn('Recognition start issue', err);
    }
  };
} else {
  // Not supported
  recordBtn.onclick = () => alert('Voice not supported in this browser. Use Chrome/Edge on desktop or Android.');
}

// Auto-focus input on load
inputEl.focus();