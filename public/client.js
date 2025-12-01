// client.js - AtomicEnd Multimodal UI logic (FINAL FIXES: Layout + Dynamic Chat Title)

'use strict';

// --- UI Elements ---
const chatEl = document.getElementById('chat');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');

// New UI Elements
const currentChatTitleEl = document.getElementById('current-chat-title');
const sidebar = document.getElementById('sidebar');
const menuBtn = document.getElementById('menuBtn');
const closeSidebarBtn = document.getElementById('closeSidebarBtn'); 
const showActionsBtn = document.getElementById('showActionsBtn');
const floatingActions = document.getElementById('floatingActions');
const chooseFileBtn = document.getElementById('chooseFileBtn'); 
const recordBtn = document.getElementById('recordBtn');
const devTeamBtn = document.getElementById('devTeamBtn');

// Sidebar/Footer Elements
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.getElementById('chat-list');
const clearHistoryBtn = document.getElementById('clearHistoryBtn'); 
const signInBtn = document.getElementById('signInBtn');

// Dev Form Elements
const devFormContainer = document.getElementById('devFormContainer');
const devSubmitBtn = document.getElementById('devSubmitBtn');
const devContactInput = document.getElementById('devContactInput');
const devMessageInput = document.getElementById('devMessageInput');


// --- Session Management ---
let chatHistory = JSON.parse(localStorage.getItem('atomicEndChats')) || {};
let activeChatId = localStorage.getItem('atomicEndActiveChatId') || 'default';
let uploadedFileBase64 = null; 
let uploadedFileMimeType = null;
let isSending = false; 

const CHAT_ENDPOINT = '/chat'; 
const INITIAL_AI_MSG = `Welcome to **AtomicEnd**, the Elite AI platform crafted by Atomic! I specialize in:
* **Code Generation** (HTML, JS, Python, almost any language you can think of, etc.)
* **Deep Research** & Analysis
* **Project Setup** & File Generation (ZIP/APK/EXE source and many more)
* **I do Guided Study** & Debugging.
How can I assist you with your project today?`;

// --- Voice Recognition Setup ---
let recognizing = false;
let recognition = null;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        recognizing = true;
        recordBtn.textContent = '🔴 Recording...';
        recordBtn.style.backgroundColor = '#ff005a';
    };
    recognition.onend = () => {
        recognizing = false;
        recordBtn.textContent = '🎙️ Record';
        recordBtn.style.backgroundColor = '#222';
    };
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        submitChat(transcript); 
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

function displayError(message) {
    const errorHtml = `
        <span style="color:var(--accent); font-family:monospace; font-size:1.1em;">
            &lt;! **CRITICAL ERROR** : &gt;
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

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {
        codeContent = codeContent.replace(/^<br>/, '');
        return `<div class="code-container"><pre><code class="copyable-code">${codeContent}</code></pre></div>`;
    });

    // Bold / Italic
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // ZIP response tag
    const ZIP_START_TAG = /---ZIP_RESPONSE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END_ZIP---/;
    let zipMatch;
    if (zipMatch = html.match(ZIP_START_TAG)) {
        const fileName = zipMatch[1];
        const base64Data = zipMatch[2].replace(/<br>/g, '');
        const buttonHtml = `<a href="#" onclick="downloadBase64File('${base64Data}', '${fileName}', 'application/zip'); return false;" class="download-btn zip-download-btn">💾 Download ${fileName}</a>`;
        html = html.replace(zipMatch[0], buttonHtml);
    }

    const FILE_START_TAG = /---FILE:([\w\d\.-]+)---<br>([\s\S]*?)<br>---END FILE---/;
    let fileMatch;
    if (fileMatch = html.match(FILE_START_TAG)) {
        const fileName = fileMatch[1];
        const fileContent = fileMatch[2].replace(/<br>/g, '\n');
        // CRITICAL FIX: Escape content before passing to JS function
        const buttonHtml = `<a href="#" onclick="downloadFileContent('${escapeHtml(fileContent)}', '${fileName}', 'text/plain'); return false;" class="download-btn file-download-btn">⬇️ Download ${fileName}</a>`;
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
  chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' }); // Smooth scroll
  return div;
}

async function typeWriter(el, htmlContent, speed = 12) {
    devFormContainer.style.display = 'none';
    el.innerHTML = ''; 
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const fullText = tempDiv.textContent || '';

    for (let i = 0; i < fullText.length; i++) {
        el.textContent = fullText.substring(0, i + 1);
        if (i % 3 === 0) await new Promise(r => setTimeout(r, speed));
    }
    
    el.innerHTML = htmlContent;

    const finalRenderedText = fullText.toLowerCase(); 

    if (finalRenderedText.includes('interested in joining the team') || finalRenderedText.includes('submission form is available below')) {
        devFormContainer.style.display = 'flex';
        chatEl.scrollTop = chatEl.scrollHeight;
    }
}


// --- Main Chat Submission Logic ---
async function submitChat(message) {
    if(isSending) return; 
    isSending = true;

    // Hide actions menu and dev form
    floatingActions.style.display = 'none';
    devFormContainer.style.display = 'none';
    
    // Check if we need to rename the chat BEFORE submission
    const currentTitle = chatHistory[activeChatId]?.title;
    if (currentTitle === 'New Chat' || currentTitle === 'Untitled Chat' || !currentTitle) {
        // CRITICAL FIX: Set the chat title to the first 30 chars of the new message
        const newTitle = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        chatHistory[activeChatId] = chatHistory[activeChatId] || { history: [] };
        chatHistory[activeChatId].title = newTitle;
        currentChatTitleEl.textContent = newTitle;
    }

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

    const aiDiv = appendMessage('ai', '<span class="typing">...</span>');
    const span = aiDiv.querySelector('span');
    
    // Enhanced UX Feedback (Preserved)
    const promptLower = textPrompt.toLowerCase();
    if (promptLower.includes('zip file') || promptLower.includes('project file') || promptLower.includes('create a project')) {
        span.textContent = 'AtomicEnd is generating a large, multi-file project package...';
    } else if (promptLower.includes('deep research') || promptLower.includes('guided study')) {
        span.textContent = 'AtomicEnd is initiating deep research and analysis...';
    } else if (promptLower.includes('generate image') || promptLower.includes('create a picture')) {
        span.textContent = 'AtomicEnd is routing your request. **Image generation is a premium service and currently under integration.**';
    } else {
        span.textContent = 'AtomicEnd is processing...';
    }


    try {
        const response = await fetch(CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Server returned an error.');
        }

        const data = await response.json();
        
        // History Update and Persistence
        const aiResponsePart = { role: 'model', parts: [{ text: data.response }] };
        const userPart = { role: 'user', parts: partsArray }; 

        // If the chat was just created/renamed above, it already has a title.
        if (!chatHistory[activeChatId]) {
            // Should not happen if the check above runs correctly, but for safety:
            chatHistory[activeChatId] = { title: currentChatTitleEl.textContent, history: [] };
        }
        
        chatHistory[activeChatId].history.push(userPart, aiResponsePart);
        
        localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));
        
        // Final UI Update
        renderChatList();
        
        span.textContent = ''; 
        const finalHtml = markdownToHtml(data.response);
        await typeWriter(span, finalHtml, 12);

    } catch (error) {
        const errorMessage = error.message.includes("400") ? 
            "A core AI technical error occurred. This may be due to unsupported file types, system load, or rate limits." : 
            error.message;
        
        span.remove(); 
        displayError(errorMessage);
        console.error('Chat submission error:', error);
    } finally {
        isSending = false;
        // Reset send button appearance
        sendBtn.innerHTML = '▲'; 
        sendBtn.style.backgroundColor = 'var(--send-btn-bg)';
    }
}


// --- Multi-Chat Functions ---
function renderChatList() {
    chatList.innerHTML = '';
    const chatIds = Object.keys(chatHistory);
    
    if (chatIds.length === 0) {
        startNewChat('default', 'General Chat');
        return;
    }

    // Sort by session ID timestamp (newest first)
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
                if (id === activeChatId) {
                    currentChatTitleEl.textContent = newTitle.trim();
                }
            }
        };

        chatList.appendChild(div);
    });
}

function loadChat(chatId) {
    activeChatId = chatId;
    localStorage.setItem('atomicEndActiveChatId', chatId);
    
    chatEl.innerHTML = '';
    currentChatTitleEl.textContent = chatHistory[chatId]?.title || 'New Chat';
    
    // Always append the initial AI message when loading a chat
    appendMessage('ai', markdownToHtml(INITIAL_AI_MSG));

    const chat = chatHistory[chatId];
    
    if (chat && chat.history) {
        let historyToRender = chat.history;

        historyToRender.forEach(turn => {
            if (turn.role === 'user' && turn.parts[0].text) {
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
    
    // Close sidebar on mobile after loading new chat
    if (window.innerWidth < 768) {
        sidebar.classList.remove('open');
    }
}

function startNewChat(id = null, title = 'New Chat') {
    const newId = id || `session_${Date.now()}`; 
    // New chats start with a generic title that will be updated on first message
    chatHistory[newId] = { title: title, history: [] };
    loadChat(newId);
}

// --- Event Listeners and Initial Load ---

// Toggle Floating Actions Menu
showActionsBtn.onclick = () => {
    floatingActions.style.display = floatingActions.style.display === 'flex' ? 'none' : 'flex';
    devFormContainer.style.display = 'none'; // Hide form if actions shown
};

// Dev Team Button in Floating Menu
devTeamBtn.onclick = () => {
    floatingActions.style.display = 'none';
    const formStyle = devFormContainer.style.display;
    devFormContainer.style.display = formStyle === 'flex' ? 'none' : 'flex';
    if (devFormContainer.style.display === 'flex') {
        chatEl.scrollTop = chatEl.scrollHeight;
    }
};

// Auto resize textarea
inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto'; 
    // Limit max height for large screens
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 220)}px`;
});

// Send button click
sendBtn.onclick = () => {
    submitChat(inputEl.value.trim());
};

// Enter key to send (Shift+Enter for newline)
inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

// File Upload Logic
chooseFileBtn.onclick = () => {
    floatingActions.style.display = 'none'; // Hide menu
    fileInput.click();
};

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/zip' || file.name.endsWith('.zip')) {
        alert("AtomicEnd cannot process ZIP files directly. Please extract and upload a single code file or image.");
        fileInput.value = ''; 
        return;
    }

    if (file.size > 20 * 1024 * 1024) { 
        alert("File size exceeds 20MB limit for upload. Please use a smaller file.");
        fileInput.value = ''; 
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedFileBase64 = event.target.result.split(',')[1];
        uploadedFileMimeType = file.type;
        
        // Give user feedback on the Send button
        sendBtn.innerHTML = '📎'; 
        sendBtn.style.backgroundColor = '#ffc107'; // Yellow/Orange indicator
    };
    reader.readAsDataURL(file);
};

// Sidebar Controls
menuBtn.onclick = () => {
    sidebar.classList.add('open');
};
closeSidebarBtn.onclick = () => {
    sidebar.classList.remove('open');
};
newChatBtn.onclick = () => {
    startNewChat();
};
clearHistoryBtn.onclick = () => {
    if (confirm("Are you sure you want to clear ALL chat history?")) {
        localStorage.removeItem('atomicEndChats');
        localStorage.removeItem('atomicEndActiveChatId');
        chatHistory = {};
        activeChatId = 'default';
        startNewChat('default', 'General Chat');
        alert("All history cleared. Starting a fresh chat session.");
    }
};

signInBtn.onclick = () => {
    alert("Account Settings and Cloud Sync feature coming soon!");
};

// Dev Submission Logic (Preserved)
devSubmitBtn.onclick = async () => {
    const contact = devContactInput.value.trim();
    const message = devMessageInput.value.trim();
    if (contact.length < 5 || message.length < 10) {
        alert("Please provide a valid contact and a message.");
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