// public/client.js (UPDATED for Auth)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            // ... (SW registration unchanged)
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

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
const showActionsBtn = document.getElementById('showActionsBtn');
const floatingActions = document.getElementById('floatingActions');
const chooseFileBtn = document.getElementById('chooseFileBtn');
const recordBtn = document.getElementById('recordBtn');
const devTeamBtn = document.getElementById('devTeamBtn');

// Sidebar/Footer Elements
const newChatBtn = document.getElementById('newChatBtn');
const chatList = document.getElementById('chat-list');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
// RENAMED ELEMENT: signInBtn is now LogoutBtn and userInfo
const logoutBtn = document.getElementById('logoutBtn'); // ID change in chat.html needed!
const userInfoEl = document.getElementById('userInfo'); // NEW ID in chat.html needed!


// Dev Form Elements
const devFormOverlay = document.getElementById('devFormOverlay');
const devFormContainer = document.getElementById('devFormContainer');
const closeDevFormBtn = document.getElementById('closeDevFormBtn');
const devSubmitBtn = document.getElementById('devSubmitBtn');
const devContactInput = document.getElementById('devContactInput');
const devMessageInput = document.getElementById('devMessageInput');

// NEW EDIT ELEMENTS
const editActionsOverlay = document.getElementById('editActionsOverlay');
const editMessageBtn = document.getElementById('editMessageBtn');

// --- Session Management ---
// NOTE: Chat history is still local storage, but it's now tied to a logged-in session.
let chatHistory = JSON.parse(localStorage.getItem('atomicEndChats')) || {};
let activeChatId = localStorage.getItem('atomicEndActiveChatId') || 'default';
let uploadedFileBase64 = null;
let uploadedFileMimeType = null;
let isSending = false;
let messageToEditData = null;
let currentUser = null; // New variable to store logged-in user info

const CHAT_ENDPOINT = '/chat';
const INITIAL_AI_MSG = `Welcome to AtomicEnd, the Elite AI platform crafted by Atomic! I specialize in:
// (Rest of INITIAL_AI_MSG unchanged)
Code Generation (HTML, JS, Python, almost any language you can think of, Godot GDScript, etc.)

Deep Research & Analysis

Project Setup & File Generation (ZIP/APK/EXE source and many more)

I do Guided Study & Debugging.
How can I assist you with your project today?`;


// --- Voice Recognition Setup (Unchanged) ---
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
        recordBtn.textContent = '🎙️';    
        recordBtn.style.backgroundColor = '#222';    
    };    
    recognition.onresult = (e) => {    
        const transcript = e.results[0][0].transcript;    
        submitChat(transcript);     
    };

} else {
    recordBtn.onclick = () => alert('Voice recognition is not supported in this browser. Please use Chrome/Edge.');
}

recordBtn.addEventListener('click', () => {
    if (!recognition) {
        alert('Voice recognition is not available.');
        return;
    }

    if (recognizing) recognition.stop();    
    else recognition.start();

});

// --- Utility Functions (Unchanged) ---
function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (m)=>({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[m]);
}

function displayError(message) {
    const errorHtml =     `<span style="color:var(--accent); font-family:monospace; font-size:1.1em;">     &lt;! **CRITICAL ERROR** : &gt;     </span>     <br>     <span style="color:#f90; font-weight:bold;">     ${message}     </span>`;
    appendMessage('ai', errorHtml);
}

function markdownToHtml(rawText) {
    let html = escapeHtml(rawText);
    html = html.replace(/\n/g, '<br>');

    // CRITICAL FIX: Ensure code blocks handle newlines correctly and are not corrupted by HTML escaping
    html = html.replace(/```([\s\S]*?)```/g, (match, codeContent) => {    
        // Remove the <br> added to the beginning of the code block content by the previous replace.
        codeContent = codeContent.replace(/^<br>/, '');    
        // Restore real newlines inside the code block so that the code is structured correctly
        const cleanCodeContent = codeContent.replace(/<br>/g, '\n'); 
        return `<div class="code-container"><pre><code class="copyable-code">${cleanCodeContent}</code></pre></div>`;    
    });    

    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');    
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');    

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
    // Check for a single file download tag. ZIP tag takes precedence.
    if (!zipMatch && (fileMatch = html.match(FILE_START_TAG))) {    
        const fileName = fileMatch[1];    
        // CRITICAL: Restore real newlines in file content for correct download
        const fileContent = fileMatch[2].replace(/<br>/g, '\n');    
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
    // CRITICAL: Unescape HTML content before creating the Blob
    const cleanContent = content.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n/g, '\n');
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
    chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: 'smooth' });
    return div;
}

async function typeWriter(el, htmlContent, speed = 12) {
    devFormOverlay.style.display = 'none';
    el.innerHTML = '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const fullText = tempDiv.textContent || '';
    
    // Simple text for typewriter effect
    for (let i = 0; i < fullText.length; i++) {    
        el.textContent = fullText.substring(0, i + 1);    
        if (i % 3 === 0) await new Promise(r => setTimeout(r, speed));    
    }    
    
    // Final render with full markdown/HTML
    el.innerHTML = htmlContent;    

    const finalRenderedText = fullText.toLowerCase();     

    if (finalRenderedText.includes('interested in joining the team') || finalRenderedText.includes('submission form is available below')) {    
        devFormOverlay.style.display = 'flex';    
    }
}

// --- Editing Logic (Unchanged) ---
window.showEditActions = (chatId, messageIndex) => {
    floatingActions.style.display = 'none';
    devFormOverlay.style.display = 'none';

    messageToEditData = { chatId, index: messageIndex };    
    
    editActionsOverlay.style.display = 'flex';

};

editMessageBtn.onclick = () => {
    if (!messageToEditData) return;

    const { chatId, index } = messageToEditData;    
    const chat = chatHistory[chatId];    

    if (!chat || index >= chat.history.length) return;    

    const originalText = chat.history[index].parts[0].text;    
    const newText = prompt("Edit your message:", originalText);    

    editActionsOverlay.style.display = 'none';    

    if (newText && newText.trim() !== originalText) {    
        chat.history[index].parts[0].text = newText.trim();    
        chat.history.splice(index + 1);    
        localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));    
        loadChat(chatId);    
        setTimeout(() => submitChat(newText.trim()), 50);    
    }    

    messageToEditData = null;

};

editActionsOverlay.onclick = (e) => {
    if (e.target.id === 'editActionsOverlay') {
        editActionsOverlay.style.display = 'none';
        messageToEditData = null;
    }
};

// --- Main Chat Submission (Unchanged) ---
async function submitChat(message) {
    if(isSending) return;
    isSending = true;

    // (Code logic for sending message, handling history, etc. remains the same)
    floatingActions.style.display = 'none';    
    devFormOverlay.style.display = 'none';    
    editActionsOverlay.style.display = 'none';    

    const currentTitle = chatHistory[activeChatId]?.title;    
    if (!currentTitle || currentTitle === 'New Chat' || currentTitle === 'Untitled Chat' || activeChatId === 'default') {    
        const newTitle = message.substring(0, 30) + (message.length > 30 ? '...' : '');    
        chatHistory[activeChatId] = chatHistory[activeChatId] || { history: [] };    
        chatHistory[activeChatId].title = newTitle || 'Untitled Chat';    
        currentChatTitleEl.textContent = chatHistory[activeChatId].title;    
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
    } else if (!textPrompt.length) {    
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

    inputEl.value = '';    
    inputEl.style.height = '44px';     
    uploadedFileBase64 = null;    
    uploadedFileMimeType = null;    

    const aiDiv = appendMessage('ai', '<span class="typing">...</span>');    
    const span = aiDiv.querySelector('span');    

    const lower = textPrompt.toLowerCase();    
    if (lower.includes('zip file') || lower.includes('project file') || lower.includes('create a project')) {    
        span.textContent = 'AtomicEnd is generating a large, multi-file project package...';    
    } else if (lower.includes('deep research') || lower.includes('guided study')) {    
        span.textContent = 'AtomicEnd is initiating deep research and analysis...';    
    } else if (lower.includes('generate image') || lower.includes('create a picture')) {    
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
            
        const aiResponsePart = { role: 'model', parts: [{ text: data.response }] };    
        const userPart = { role: 'user', parts: partsArray };     

        if (!chatHistory[activeChatId]) {    
            chatHistory[activeChatId] = { title: currentChatTitleEl.textContent, history: [] };    
        }    
            
        chatHistory[activeChatId].history.push(userPart, aiResponsePart);    
            
        localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));    
            
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
        sendBtn.innerHTML = '▲';     
        sendBtn.style.backgroundColor = 'var(--send-btn-bg)';    
    }

}

// --- Multi-Chat, DevSubmit, etc. (Unchanged, copied from previous turn) ---
function renderChatList() {
    // ... (logic remains the same)
    chatList.innerHTML = '';
    const chatIds = Object.keys(chatHistory);

    if (chatIds.length === 0) {    
        startNewChat('default', 'General Chat');    
        return;    
    }    

    const realChatIds = chatIds.filter(id => id !== 'default' || chatIds.length === 1);

    realChatIds.sort((a, b) => b.substring(8) - a.substring(8));    

    realChatIds.forEach(id => {    
        const chat = chatHistory[id];    
        const div = document.createElement('div');    
        div.className = `chat-thread-item ${id === activeChatId ? 'active' : ''}`;    
        div.textContent = chat.title || 'Untitled Chat';    
        div.onclick = () => loadChat(id);    

        div.ondblclick = () => {    
            const newTitle = prompt('Rename chat:', chat.title);    
            if (newTitle && newTitle.trim()) {    
                chat.title = newTitle.trim();    
                localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));    
                renderChatList();    
                if (id === activeChatId) currentChatTitleEl.textContent = newTitle.trim();    
            }    
        };    

        chatList.appendChild(div);    
    });

}

function loadChat(chatId) {
    // ... (logic remains the same)
    activeChatId = chatId;
    localStorage.setItem('atomicEndActiveChatId', chatId);

    chatEl.innerHTML = '';    
    currentChatTitleEl.textContent = chatHistory[chatId]?.title || 'New Chat';    

    const chat = chatHistory[chatId];
    if (!chat || !chat.history || chat.history.length === 0) {
        appendMessage('ai', markdownToHtml(INITIAL_AI_MSG));
    }
    
    if (chat?.history) {    
        chat.history.forEach((turn, index) => {    
            if (turn.role === 'user' && turn.parts[0].text) {    
                let userHtml = escapeHtml(turn.parts[0].text);    
                const filePart = turn.parts.find(p => p.inlineData);    
                if (filePart) {    
                    userHtml += `<br><em>[File: ${filePart.inlineData.mimeType} attached]</em>`;    
                }    

                const userMsgDiv = appendMessage('user', userHtml);    
                userMsgDiv.onclick = () => showEditActions(chatId, index);    

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
    // ... (logic remains the same)
    const newId = id || `session_${Date.now()}`;
    chatHistory[newId] = { title, history: [] };

    if (id !== 'default') {    
        localStorage.setItem('atomicEndChats', JSON.stringify(chatHistory));    
    }    

    loadChat(newId);

}


// --- Event Listeners (Updated for Logout) ---
showActionsBtn.onclick = () => {
    floatingActions.style.display = 'none';
    devFormOverlay.style.display = 'none';
    editActionsOverlay.style.display = 'none';
    floatingActions.style.display = floatingActions.style.display === 'flex' ? 'none' : 'flex';
};

devTeamBtn.onclick = () => {
    floatingActions.style.display = 'none';
    devFormOverlay.style.display =
        devFormOverlay.style.display === 'flex' ? 'none' : 'flex';
};

closeDevFormBtn.onclick = () => devFormOverlay.style.display = 'none';

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 220)}px`;
});

sendBtn.onclick = () => submitChat(inputEl.value.trim());

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
    }
});

chooseFileBtn.onclick = () => {
    floatingActions.style.display = 'none';
    fileInput.click();
};

fileInput.onchange = (e) => {
    // ... (logic remains the same)
    const file = e.target.files[0];
    if (!file) return;

    if (file.type === 'application/zip' || file.name.endsWith('.zip')) {    
        alert("AtomicEnd cannot process ZIP files directly.");    
        fileInput.value = '';    
        return;    
    }    

    if (file.size > 20 * 1024 * 1024) {    
        alert("File exceeds 20MB limit.");    
        fileInput.value = '';    
        return;    
    }    

    const reader = new FileReader();    
    reader.onload = (event) => {    
        uploadedFileBase64 = event.target.result.split(',')[1];    
        uploadedFileMimeType = file.type;    

        sendBtn.innerHTML = '📎';    
        sendBtn.style.backgroundColor = '#ffc107';    
    };    
    reader.readAsDataURL(file);

};

menuBtn.onclick = () => {
    sidebar.classList.toggle('open');
};

newChatBtn.onclick = () => {
    startNewChat(null, 'New Chat');
    if (window.innerWidth < 768) {
        sidebar.classList.remove('open');
    }
};

clearHistoryBtn.onclick = () => {
    if (confirm("Clear ALL chat history?")) {
        localStorage.removeItem('atomicEndChats');
        localStorage.removeItem('atomicEndActiveChatId');
        chatHistory = {};
        activeChatId = 'default';
        startNewChat('default', 'General Chat');
        alert("History cleared.");
    }
};

// Log out button redirects to server logout route
if (logoutBtn) {
    logoutBtn.onclick = () => {
        window.location.href = '/logout';
    };
}

devSubmitBtn.onclick = async () => {
    // ... (logic remains the same, but now server saves to DB)
    const contact = devContactInput.value.trim();
    const message = devMessageInput.value.trim();
    if (contact.length < 5 || message.length < 10) {
        alert("Please enter valid contact + message (min 10 chars in message).");
        return;
    }

    devContactInput.value = '';    
    devMessageInput.value = '';    

    const statusDiv = appendMessage('ai', 'Submitting...');    

    try {    
        const response = await fetch('/submit-dev-contact', {    
            method: 'POST',    
            headers: { 'Content-Type': 'application/json' },    
            body: JSON.stringify({ contact, message })    
        });    
            
        const data = await response.json();    

        statusDiv.innerHTML =    
            data.success ?    
            '✅ **Success!** Your contact info has been logged to the database.' :    
            `❌ Submission Failed: ${data.message || 'Server error.'}`;    

    } catch (error) {    
        statusDiv.innerHTML = `❌ Network Error: Could not reach server.`;    
        console.error(error);    
    } finally {    
        devFormOverlay.style.display = 'none';    
    }

};

// In public/client.js, replace the entire function checkAuthAndLoad
async function checkAuthAndLoad() {
    try {
        const response = await fetch('/user-status'); 
        
        if (!response.ok) {
            // If authentication fails (server returns 401/302), redirect to the homepage
            window.location.href = '/'; 
            return;
        }

        const data = await response.json();
        currentUser = data.user;
        
        // Display User Info in the sidebar
        if(userInfoEl) {
            userInfoEl.innerHTML = `<span style="font-weight:bold;">${currentUser.displayName || currentUser.username}</span><br><span style="font-size:0.8em; color:#999;">@${currentUser.username} (GitHub)</span>`;
        }

        // ... (The rest of the chat loading logic remains unchanged) ...
        // (Ensure the new chat button listener is in there and correct)

    } catch (error) {
        console.error("Auth check failed, redirecting to homepage:", error);
        window.location.href = '/'; // Redirect to the main page /
    }
}
