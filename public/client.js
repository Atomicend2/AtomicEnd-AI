// client.js - AtomicEnd Multimodal UI logic (FINAL FIXES FOR APK)

// --- UI Elements ---
const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const chooseFileBtn = document.getElementById('chooseFileBtn'); 
const devFormContainer = document.getElementById('devFormContainer');
const devSubmitBtn = document.getElementById('devSubmitBtn');
const devContactInput = document.getElementById('devContactInput');
const devMessageInput = document.getElementById('devMessageInput');

// Sidebar Elements
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menuBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.getElementById('chat-list');
const signInBtn = document.getElementById('signInBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn'); 

// --- Session Management ---
let chatHistory = JSON.parse(localStorage.getItem('atomicEndChats')) || {};
let activeChatId = localStorage.getItem('atomicEndActiveChatId') || 'default';
let uploadedFileBase64 = null; 
let uploadedFileMimeType = null;
let isSending = false; // Prevent double submits

const CHAT_ENDPOINT = '/chat'; 
const INITIAL_AI_MSG = 'Welcome to Atomic End! How can I help you today?';

// --- Voice Recognition Setup (Code omitted for brevity, ensure your copy is complete) ---
// ... [KEEP YOUR VOICE RECOGNITION SETUP HERE] ...
let recognizing = false;
let recognition = null;
const recordBtn = document.getElementById('recordBtn');

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognizing = true;
    recordBtn.textContent = '🔴';
    recordBtn.style.opacity = "0.85";
  };

  recognition.onend = () => {
    recognizing = false;
    recordBtn.textContent = '🎙️';
    recordBtn.style.opacity = "1";
  };

  recognition.onerror = (e) => {
    recognizing = false;
    recordBtn.textContent = '🎙️';
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
  recordBtn.onclick = () => alert('Voice not supported. Use Chrome/Edge.');
}

// --- Utility Functions ---

function escapeHtml(s){ 
    return String(s).replace(/[&<>"']/g, (m)=>({ 
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' 
    })[m]); 
}

// FIX: Custom Error Display
function displayError(message) {
    const errorHtml = `
        <span style="color:var(--accent); font-family:'Courier New', monospace; font-size:1.1em;">
            &lt;! **ERROR** : &gt;
        </span>
        <br>
        <span style="color:#f90; font-weight:bold;">
            ${message}
        </span>
    `;
    appendMessage('ai', errorHtml);
}

function markdownToHtml(rawText) {
    let html = escapeHtml(rawText);
    html = html.replace(/\n/g, '<br>');

    // Code Blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        codeContent = codeContent.replace(/^<br>/, '');
        return `<div class="code-container"><pre><code class="copyable-code">${codeContent}</code></pre></div>`;
    });

    // Basic Markdown: Bold and Italics
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // ZIP Download Tags
    const ZIP_START_TAG = /---ZIP_RESPONSE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END_ZIP---/;
    let zipMatch;
    if (zipMatch = html.match(ZIP_START_TAG)) {
        const fileName = zipMatch[1];
        const base64Data = zipMatch[2].replace(/<br>/g, '');
        const buttonHtml = `<a href="#" onclick="downloadBase64File('${base64Data}', '${fileName}', 'application/zip'); return false;" class="download-btn zip-download-btn">💾 Download ${fileName}</a>`;
        html = html.replace(zipMatch[0], buttonHtml);
    }
    
    // Single File Download Tags
    const FILE_START_TAG = /---FILE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END FILE---/;
    let fileMatch;
    if (fileMatch = html.match(FILE_START_TAG)) {
        const fileName = fileMatch[1];
        const fileContent = fileMatch[2].replace(/<br>/g, '\n'); 
        const buttonHtml = `<a href="#" onclick="downloadFileContent('${fileContent}', '${fileName}', 'text/plain'); return false;" class="download-btn file-download-btn">⬇️ Download ${fileName}</a>`;
        html = html.replace(fileMatch[0], buttonHtml);
    }

    return html;
}

window.downloadBase64File = (base64, filename, mimeType) => {
    const link = document.createElement('a');
    link.href = 'data:' + mimeType + ';base64,' + base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.downloadFileContent = (content, filename, mimeType) => {
    const cleanContent = content.replace(/\\n/g, '\n');
    const blob = new Blob([cleanContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

function appendMessage(role, html) {
  const div = document.createElement('div')
  div.className = `msg ${role}`;
  div.innerHTML = html;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
  return div;
}

async function typeWriter(el, htmlContent, speed = 12) {
    devFormContainer.style.display = 'none';
    el.innerHTML = ''; 
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const fullText = tempDiv.textContent; 

    for (let i = 0; i < fullText.length; i++) {
        el.textContent = fullText.substring(0, i + 1);
        if (i % 3 === 0) await new Promise(r => setTimeout(r, speed));
    }
    
    el.innerHTML = htmlContent;

    const finalRenderedText = fullText.toLowerCase(); 

    if (finalRenderedText.includes('interested in joining the team') || finalRenderedText.includes('submission form is available below') || finalRenderedText.includes('provide your email or whatsapp number')) {
        devFormContainer.style.display = 'flex';
        chatEl.scrollTop = chatEl.scrollHeight;
    }
}


// --- Main Chat Submission Logic ---

async function submitChat(message) {
    if(isSending) return; // Prevent double submits
    isSending = true;

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
        isSending = false;
        return;
    }

    partsArray.push({ text: textPrompt });

    const historyForAPI = chatHistory[activeChatId]?.history || [];
    
    // Send full history + the new user message
    const contentsToSend = [...historyForAPI.map(item => ({role: item.role, parts: item.parts})), 
                            { role: 'user', parts: partsArray }];

    const body = {
        contents: contentsToSend, 
        sessionId: activeChatId, 
    };

    // UI Reset and Feedback
    inputEl.value = '';
    inputEl.style.height = '44px'; 
    uploadedFileBase64 = null;
    uploadedFileMimeType = null;
    chooseFileBtn.textContent = 'Attach File';
    chooseFileBtn.classList.remove('file-ready');

    const aiDiv = appendMessage('ai', '<span class="typing">...</span>');
    const span = aiDiv.querySelector('span');
    
    // Enhanced UX Feedback
    const promptLower = textPrompt.toLowerCase();

    if (promptLower.includes('zip file') || 
        promptLower.includes('project file') ||
        promptLower.includes('create a project')) {
        span.textContent = 'AtomicEnd is generating large project package (this may take a moment)...';
    } else if (promptLower.includes('generate image') || promptLower.includes('create a picture')) {
        // FIX: Better feedback for image generation
        span.textContent = 'AtomicEnd is routing your request. Image generation is a premium feature under development...';
    }
    else {
        span.textContent = 'AtomicEnd is processing...';
    }


    try {
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
        
        // History Update and Persistence
        const aiResponsePart = { role: 'model', parts: [{ text: data.response }] };
        const userPart = { role: 'user', parts: partsArray }; 

        if (!chatHistory[activeChatId]) {
            chatHistory[activeChatId] = {
                title: message.substring(0, 30) + (message.length > 30 ? '...' : ''),
                // FIX: If the chat is new, ensure the first message is the AI initial one, 
                // but we only push the user/model parts for the API's sake.
                history: []
            };
        }
        chatHistory[activeChatId].history.push(userPart, aiResponsePart);
        
        localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));
        
        // Final UI Update
        renderChatList();
        
        span.textContent = ''; 
        const finalHtml = markdownToHtml(data.response);
        await typeWriter(span, finalHtml, 12);

    } catch (error) {
        // FIX: Custom Error Message Display
        const errorMessage = error.message.includes("400") ? 
            "A technical error occurred while connecting to the core AI. This may be due to unsupported file types, system load, or rate limits." : 
            error.message;
        
        span.remove(); // Remove the "processing..." span
        displayError(errorMessage);
        console.error('Chat submission error:', error);
    } finally {
        isSending = false;
    }
}


// --- Multi-Chat Functions (Renaming included) ---

function renderChatList() {
    chatList.innerHTML = '';
    const chatIds = Object.keys(chatHistory);
    
    if (chatIds.length === 0) {
        startNewChat('default', 'General Chat');
        return;
    }

    chatIds.sort((a, b) => b.substring(8) - a.substring(8)); 

    chatIds.forEach(id => {
        const chat = chatHistory[id];
        const div = document.createElement('div');
        div.className = `chat-thread-item ${id === activeChatId ? 'active' : ''}`;
        div.textContent = chat.title || 'Untitled Chat'; 
        div.onclick = () => loadChat(id);
        
        // Manual Renaming on Double Click
        div.ondblclick = () => {
            const newTitle = prompt('Rename chat:', chat.title);
            if (newTitle && newTitle.trim().length > 0) {
                chat.title = newTitle.trim();
                localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));
                renderChatList(); 
            }
        };

        chatList.appendChild(div);
    });
}

function loadChat(chatId) {
    if (chatId === activeChatId && chatId !== 'default') return; // Prevent reload spam

    activeChatId = chatId;
    localStorage.setItem('atomicEndActiveChatId', chatId);
    
    chatEl.innerHTML = '';
    
    const chat = chatHistory[chatId];
    
    // FIX: Always append the initial AI message when loading a chat
    appendMessage('ai', INITIAL_AI_MSG);

    if (chat && chat.history) {
        chat.history.forEach(turn => {
            if (turn.role === 'user' && turn.parts[0].text) {
                // Determine if file was attached to display the file-ready tag in history
                let userHtml = escapeHtml(turn.parts[0].text);
                const filePart = turn.parts.find(p => p.inlineData);
                if (filePart) {
                    userHtml += `<br><em>[File: ${filePart.inlineData.mimeType} attached]</em>`;
                }
                appendMessage('user', userHtml);
            } else if (turn.role === 'model' && turn.parts[0].text) {
                const aiDiv = appendMessage('ai', '');
                aiDiv.innerHTML = markdownToHtml(turn.parts[0].text);
            }
        });
    }

    renderChatList();
    chatEl.scrollTop = chatEl.scrollHeight;
    
    if (window.innerWidth < 768) {
        sidebar.classList.remove('open');
    }
}

function startNewChat(id = null, title = 'New Chat') {
    const newId = id || `session_${Date.now()}`; 
    
    // The history array is now only for API calls, the initial message is rendered separately
    chatHistory[newId] = { 
        title: title, 
        history: [] // FIX: Ensure new chat starts with NO history for API calls
    };
    
    loadChat(newId);
}

// NEW: Clear History Function
clearHistoryBtn.onclick = () => {
    if (confirm("Are you sure you want to clear ALL chat history? This cannot be undone.")) {
        localStorage.removeItem('atomicEndChats');
        localStorage.removeItem('atomicEndActiveChatId');
        chatHistory = {};
        activeChatId = 'default';
        
        startNewChat('default', 'General Chat');
        alert("All history cleared. Starting a fresh chat session.");
    }
};


// --- Event Listeners and Initial Load ---

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto'; 
    inputEl.style.height = inputEl.scrollHeight + 'px';
    chatEl.scrollTop = chatEl.scrollHeight; 
});

sendBtn.onclick = () => {
    submitChat(inputEl.value.trim());
};

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

chooseFileBtn.onclick = () => {
    fileInput.click();
};

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        // FIX: BLOCK ZIP files and use custom error message
        if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
            alert("ZIP files cannot be attached directly for analysis. Please extract the files or attach a single code file/image.");
            fileInput.value = ''; 
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            if (file.size > 20 * 1024 * 1024) { 
                alert("File size exceeds 20MB limit for upload. Please use a smaller file.");
                fileInput.value = ''; 
                return;
            }

            uploadedFileBase64 = event.target.result.split(',')[1];
            uploadedFileMimeType = file.type;
            
            chooseFileBtn.textContent = `File Ready: ${file.name}`;
            chooseFileBtn.classList.add('file-ready');
        };
        reader.readAsDataURL(file);
    }
};

menuBtn.onclick = () => {
    sidebar.classList.toggle('open');
};

newChatBtn.onclick = () => {
    startNewChat();
};

signInBtn.onclick = () => {
    alert("Sign-in feature coming soon! This will enable user-specific settings, cloud history backup, and premium features.");
};

// ... [KEEP YOUR DEV SUBMIT BUTTON LOGIC HERE] ...
devSubmitBtn.onclick = async () => {
    const contact = devContactInput.value.trim();
    const message = devMessageInput.value.trim();

    if (contact.length < 5 || message.length < 10) {
        alert("Please provide a valid contact (email/number) and a short message (min 10 characters).");
        return;
    }
    
    devContactInput.value = '';
    devMessageInput.value = '';

    const statusDiv = appendMessage('ai', 'Submitting contact...');
    
    try {
        const response = await fetch('/submit-dev-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contact, message })
        });
        
        const data = await response.json();

        if (data.success) {
            statusDiv.innerHTML = '✅ **Success!** Your contact information has been logged. The developer will reach out soon.';
        } else {
            statusDiv.innerHTML = `❌ Submission Failed: ${data.message || 'Check server logs.'}`;
        }
    } catch (error) {
        statusDiv.innerHTML = `❌ Network Error: Could not reach server.`;
        console.error('Submission error:', error);
    } finally {
        devFormContainer.style.display = 'none';
    }
};


// Initial load
window.onload = () => {
    if (!chatHistory[activeChatId]) {
        startNewChat('default', 'General Chat');
    } else {
        loadChat(activeChatId); 
    }
    renderChatList();
    inputEl.focus();
};