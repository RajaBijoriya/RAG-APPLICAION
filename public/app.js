// RAG Application Frontend
class RAGApp {
    constructor() {
        this.isProcessing = false;
        this.initializeEventListeners();
        this.updateStoreStatus();
        
        // Update store status periodically
        setInterval(() => {
            if (!this.isProcessing) {
                this.updateStoreStatus();
            }
        }, 30000); // Update every 30 seconds
    }

    initializeEventListeners() {
        document.getElementById('addTextBtn').addEventListener('click', () => this.addTextToStore());
        document.getElementById('uploadFilesBtn').addEventListener('click', () => this.uploadFiles());
        this.setupFileDropZone();
        document.getElementById('addUrlBtn').addEventListener('click', () => this.addUrlToStore());
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('clearStoreBtn').addEventListener('click', () => this.clearStore());
    }

    setupFileDropZone() {
        const dropZone = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('fileInput');
        
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
        });
        
        // Highlight drop zone when item is dragged over it
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });
        
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });
        
        // Handle dropped files
        dropZone.addEventListener('drop', (e) => { 
            fileInput.files = e.dataTransfer.files; 
            this.displaySelectedFiles();
        });
        
        // Handle click to open file dialog - only on the upload text area, not the entire drop zone
        const uploadText = dropZone.querySelector('.upload-text');
        uploadText.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        
        // Handle file selection
        fileInput.addEventListener('change', () => this.displaySelectedFiles());
    }

    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    async addTextToStore() {
        const textInput = document.getElementById('textInput');
        const text = textInput.value.trim();
        if (!text) {
            this.showToast('Please enter some text', 'warning');
            return;
        }
        this.showLoading('Processing text...');
        try {
            const response = await fetch('/api/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to process text.');
            }
            this.showToast(result.message, 'success');
            textInput.value = '';
            this.updateStoreStatus();
        } catch (error) {
            console.error('Error adding text:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async uploadFiles() {
        const fileInput = document.getElementById('fileInput');
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
            this.showToast('Please select files to upload', 'warning');
            return;
        }
        this.showLoading(`Processing ${files.length} file(s)...`);
        try {
            for (const file of files) {
                await this.uploadFile(file);
            }
            fileInput.value = '';
            this.displaySelectedFiles();
        } catch (error) {
            console.error('Error processing files:', error);
        } finally {
            this.hideLoading();
        }
    }

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to upload file.');
            }
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
            throw error;
        }
    }

    async addUrlToStore() {
        const urlInput = document.getElementById('urlInput');
        const url = urlInput.value.trim();
        if (!url || !this.isValidUrl(url)) {
            this.showToast('Please enter a valid URL', 'warning');
            return;
        }
        this.showLoading('Scraping website...');
        try {
            const response = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to scrape URL.');
            }
            this.showToast(result.message, 'success');
            urlInput.value = '';
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        const message = chatInput.value.trim();
        if (!message) return;

        this.addMessageToChat(message, 'user');
        chatInput.value = '';
        const typingId = this.addTypingIndicator();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to get response.');
            }
            this.removeTypingIndicator(typingId);
            this.addMessageToChat(result.reply, 'bot');
        } catch (error) {
            this.removeTypingIndicator(typingId);
            this.addMessageToChat(`Sorry, I encountered an error: ${error.message}`, 'bot');
        }
    }

    addMessageToChat(message, sender) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = message.replace(/\n/g, '<br>');
        messageDiv.appendChild(contentDiv);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    addTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        const typingId = 'typing-' + Date.now();
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = 'message bot-message';
        typingDiv.innerHTML = `<div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingId;
    }

    removeTypingIndicator(typingId) {
        const typingElement = document.getElementById(typingId);
        if (typingElement) typingElement.remove();
    }

    async clearStore() {
        if (!confirm('Are you sure you want to clear all data from the RAG store? This action cannot be undone.')) {
            return;
        }
        
        this.showLoading('Clearing store...');
        try {
            const response = await fetch('/api/store/clear', {
                method: 'DELETE'
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to clear store.');
            }
            this.showToast(result.message, 'success');
            this.updateStoreStatus();
            
            // Clear chat messages except the initial bot message
            const chatMessages = document.getElementById('chatMessages');
            chatMessages.innerHTML = `
                <div class="message bot-message">
                    <div class="message-content">
                        <p>Hello! I'm ready to answer questions about your uploaded documents. Please add some data to the RAG store first, then ask me anything!</p>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error clearing store:', error);
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    async updateStoreStatus() {
        try {
            const response = await fetch('/api/store/stats');
            const result = await response.json();
            
            // Update status display
            const statusElement = document.getElementById('storeStatus');
            if (this.isProcessing) {
                statusElement.textContent = 'Processing...';
                statusElement.className = 'status-processing';
            } else {
                statusElement.textContent = result.status === 'ready' ? 'Ready' : 'Error';
                statusElement.className = result.status === 'ready' ? 'status-ready' : 'status-error';
            }
            
            // Note: Document and chunk counts would require additional Qdrant API calls
            // For now, showing placeholder values
            document.getElementById('docCount').textContent = 'Active';
            document.getElementById('chunkCount').textContent = 'Active';
        } catch (error) {
            console.error('Error updating store status:', error);
            document.getElementById('docCount').textContent = 'Error';
            document.getElementById('chunkCount').textContent = 'Error';
            const statusElement = document.getElementById('storeStatus');
            statusElement.textContent = 'Error';
            statusElement.className = 'status-error';
        }
    }

    showLoading(message = 'Processing...') {
        this.isProcessing = true;
        this.updateStoreStatus();
        const overlay = document.getElementById('loadingOverlay');
        overlay.querySelector('p').textContent = message;
        overlay.classList.add('active');
    }

    hideLoading() {
        this.isProcessing = false;
        this.updateStoreStatus();
        const overlay = document.getElementById('loadingOverlay');
        overlay.classList.remove('active');
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 3000);
    }

    displaySelectedFiles() {
        const fileInput = document.getElementById('fileInput');
        const selectedFilesContainer = document.getElementById('selectedFiles');
        const files = Array.from(fileInput.files);
        
        if (files.length === 0) {
            selectedFilesContainer.innerHTML = '';
            return;
        }
        
        selectedFilesContainer.innerHTML = files.map((file, index) => {
            const fileIcon = this.getFileIcon(file.type);
            const fileSize = this.formatFileSize(file.size);
            
            return `
                <div class="file-item" data-index="${index}">
                    <div class="file-info">
                        <span class="file-icon">${fileIcon}</span>
                        <div>
                            <div class="file-name">${file.name}</div>
                            <div class="file-size">${fileSize}</div>
                        </div>
                    </div>
                    <button class="remove-file" onclick="app.removeFile(${index})" title="Remove file">
                        ✕
                    </button>
                </div>
            `;
        }).join('');
    }
    
    getFileIcon(mimeType) {
        if (mimeType === 'application/pdf') return '📄';
        if (mimeType === 'text/csv') return '📊';
        if (mimeType === 'text/plain') return '📝';
        return '📁';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    removeFile(index) {
        const fileInput = document.getElementById('fileInput');
        const dt = new DataTransfer();
        const files = Array.from(fileInput.files);
        
        files.forEach((file, i) => {
            if (i !== index) {
                dt.items.add(file);
            }
        });
        
        fileInput.files = dt.files;
        this.displaySelectedFiles();
    }
    
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new RAGApp();
});
