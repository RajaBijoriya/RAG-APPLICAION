import { useState, useEffect, useRef } from 'react'
import Head from 'next/head'

export default function Home() {
  const [textInput, setTextInput] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState([
    {
      id: 1,
      content: "Hello! I'm ready to answer questions about your uploaded documents. Please add some data to the RAG store first, then ask me anything!",
      sender: 'bot'
    }
  ])
  const [files, setFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Processing...')
  const [storeStatus, setStoreStatus] = useState({
    status: 'ready',
    docCount: 'Active',
    chunkCount: 'Active'
  })
  const [typingId, setTypingId] = useState(null)

  const fileInputRef = useRef(null)
  const chatMessagesRef = useRef(null)
  const dropZoneRef = useRef(null)

  // Update store status periodically
  useEffect(() => {
    updateStoreStatus()
    const interval = setInterval(() => {
      if (!isProcessing) {
        updateStoreStatus()
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [isProcessing])

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [messages])

  // File drag and drop handlers
  useEffect(() => {
    const dropZone = dropZoneRef.current
    if (!dropZone) return

    const preventDefaults = (e) => {
      e.preventDefault()
      e.stopPropagation()
    }

    const handleDrop = (e) => {
      preventDefaults(e)
      dropZone.classList.remove('dragover')
      const droppedFiles = Array.from(e.dataTransfer.files)
      setFiles(droppedFiles)
    }

    const handleDragOver = (e) => {
      preventDefaults(e)
      dropZone.classList.add('dragover')
    }

    const handleDragLeave = (e) => {
      preventDefaults(e)
      dropZone.classList.remove('dragover')
    }

    dropZone.addEventListener('dragenter', preventDefaults)
    dropZone.addEventListener('dragover', handleDragOver)
    dropZone.addEventListener('dragleave', handleDragLeave)
    dropZone.addEventListener('drop', handleDrop)

    return () => {
      dropZone.removeEventListener('dragenter', preventDefaults)
      dropZone.removeEventListener('dragover', handleDragOver)
      dropZone.removeEventListener('dragleave', handleDragLeave)
      dropZone.removeEventListener('drop', handleDrop)
    }
  }, [])

  const showToast = (message, type = 'success') => {
    // Create toast notification
    const toast = document.createElement('div')
    toast.className = `toast ${type}`
    toast.textContent = message
    
    const container = document.getElementById('toastContainer')
    if (container) {
      container.appendChild(toast)
      setTimeout(() => toast.remove(), 3000)
    }
  }

  const showLoading = (message = 'Processing...') => {
    setIsProcessing(true)
    setLoadingMessage(message)
  }

  const hideLoading = () => {
    setIsProcessing(false)
  }

  const updateStoreStatus = async () => {
    try {
      const response = await fetch('/api/store/stats')
      const result = await response.json()
      setStoreStatus({
        status: result.status === 'ready' ? 'ready' : 'error',
        docCount: 'Active',
        chunkCount: 'Active'
      })
    } catch (error) {
      console.error('Error updating store status:', error)
      setStoreStatus({
        status: 'error',
        docCount: 'Error',
        chunkCount: 'Error'
      })
    }
  }

  const addTextToStore = async () => {
    if (!textInput.trim()) {
      showToast('Please enter some text', 'warning')
      return
    }

    showLoading('Processing text...')
    try {
      const response = await fetch('/api/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput })
      })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to process text.')
      }
      
      showToast(result.message, 'success')
      setTextInput('')
      updateStoreStatus()
    } catch (error) {
      console.error('Error adding text:', error)
      showToast(error.message, 'error')
    } finally {
      hideLoading()
    }
  }

  const uploadFiles = async () => {
    if (files.length === 0) {
      showToast('Please select files to upload', 'warning')
      return
    }

    showLoading(`Processing ${files.length} file(s)...`)
    try {
      for (const file of files) {
        await uploadFile(file)
      }
      setFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error processing files:', error)
    } finally {
      hideLoading()
    }
  }

  const uploadFile = async (file) => {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload file.')
      }
      
      showToast(result.message, 'success')
    } catch (error) {
      showToast(error.message, 'error')
      throw error
    }
  }

  const addUrlToStore = async () => {
    if (!urlInput.trim() || !isValidUrl(urlInput)) {
      showToast('Please enter a valid URL', 'warning')
      return
    }

    showLoading('Scraping website...')
    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput }),
      })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to scrape URL.')
      }
      
      showToast(result.message, 'success')
      setUrlInput('')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      hideLoading()
    }
  }

  const sendMessage = async () => {
    if (!chatInput.trim()) return

    const newMessage = {
      id: Date.now(),
      content: chatInput,
      sender: 'user'
    }

    setMessages(prev => [...prev, newMessage])
    setChatInput('')
    
    const newTypingId = `typing-${Date.now()}`
    setTypingId(newTypingId)
    setMessages(prev => [...prev, {
      id: newTypingId,
      content: '',
      sender: 'bot',
      typing: true
    }])

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput }),
      })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to get response.')
      }

      setMessages(prev => prev.filter(msg => msg.id !== newTypingId))
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: result.reply,
        sender: 'bot'
      }])
    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== newTypingId))
      setMessages(prev => [...prev, {
        id: Date.now(),
        content: `Sorry, I encountered an error: ${error.message}`,
        sender: 'bot'
      }])
    }
  }

  const clearStore = async () => {
    if (!confirm('Are you sure you want to clear all data from the RAG store? This action cannot be undone.')) {
      return
    }

    showLoading('Clearing store...')
    try {
      const response = await fetch('/api/store/clear', {
        method: 'DELETE'
      })
      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to clear store.')
      }
      
      showToast(result.message, 'success')
      updateStoreStatus()
      
      // Reset chat messages
      setMessages([{
        id: 1,
        content: "Hello! I'm ready to answer questions about your uploaded documents. Please add some data to the RAG store first, then ask me anything!",
        sender: 'bot'
      }])
    } catch (error) {
      console.error('Error clearing store:', error)
      showToast(error.message, 'error')
    } finally {
      hideLoading()
    }
  }

  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files))
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const getFileIcon = (type) => {
    if (type === 'application/pdf') return '📄'
    if (type === 'text/csv') return '📊'
    if (type === 'text/plain') return '📝'
    return '📁'
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const isValidUrl = (string) => {
    try {
      new URL(string)
      return true
    } catch (_) {
      return false
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      sendMessage()
    }
  }

  return (
    <>
      <Head>
        <title>RAG Application</title>
        <meta name="description" content="Retrieval Augmented Generation for your documents" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="container">
        <header>
          <h1>🤖 RAG Application</h1>
          <p>Retrieval Augmented Generation for your documents</p>
        </header>

        <div className="main-content">
          {/* Data Input Section */}
          <div className="section" id="data-section">
            <h2>📄 Data Sources</h2>
            
            {/* Text Input */}
            <div className="input-group">
              <h3>Text Input</h3>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Enter your text content here..."
                rows="6"
              />
              <button onClick={addTextToStore} className="btn btn-primary">
                Add Text to RAG Store
              </button>
            </div>

            {/* File Upload */}
            <div className="input-group">
              <h3>File Upload</h3>
              <div className="file-upload-area" ref={dropZoneRef}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".pdf,.csv,.txt"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <div className="upload-text" onClick={() => fileInputRef.current?.click()}>
                  <p>📁 Drop files here or click to browse</p>
                  <small>Supported: PDF, CSV, TXT</small>
                </div>
              </div>
              
              {files.length > 0 && (
                <div className="selected-files">
                  {files.map((file, index) => (
                    <div key={index} className="file-item">
                      <div className="file-info">
                        <span className="file-icon">{getFileIcon(file.type)}</span>
                        <div>
                          <div className="file-name">{file.name}</div>
                          <div className="file-size">{formatFileSize(file.size)}</div>
                        </div>
                      </div>
                      <button
                        className="remove-file"
                        onClick={() => removeFile(index)}
                        title="Remove file"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <button onClick={uploadFiles} className="btn btn-primary">
                Upload Files to RAG Store
              </button>
            </div>

            {/* Website URL */}
            <div className="input-group">
              <h3>Website URL</h3>
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com"
              />
              <button onClick={addUrlToStore} className="btn btn-primary">
                Add Website to RAG Store
              </button>
            </div>
          </div>

          {/* RAG Store Status */}
          <div className="section" id="store-section">
            <h2>🗄️ RAG Store</h2>
            <div className="store-status">
              <div className="status-item">
                <span className="label">Documents:</span>
                <span>{storeStatus.docCount}</span>
              </div>
              <div className="status-item">
                <span className="label">Chunks:</span>
                <span>{storeStatus.chunkCount}</span>
              </div>
              <div className="status-item">
                <span className="label">Status:</span>
                <span className={`status-${storeStatus.status}`}>
                  {isProcessing ? 'Processing...' : (storeStatus.status === 'ready' ? 'Ready' : 'Error')}
                </span>
              </div>
            </div>
            <button onClick={clearStore} className="btn btn-danger">
              Clear Store
            </button>
          </div>

          {/* Chat Interface */}
          <div className="section" id="chat-section">
            <h2>💬 Chat with Your Data</h2>
            <div className="chat-container">
              <div className="chat-messages" ref={chatMessagesRef}>
                {messages.map((message) => (
                  <div key={message.id} className={`message ${message.sender}-message`}>
                    <div className="message-content">
                      {message.typing ? (
                        <div className="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br>') }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="chat-input-container">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask a question about your documents..."
                />
                <button onClick={sendMessage} className="btn btn-primary">
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {isProcessing && (
          <div className="loading-overlay active">
            <div className="loading-spinner"></div>
            <p>{loadingMessage}</p>
          </div>
        )}

        {/* Toast Notifications */}
        <div className="toast-container" id="toastContainer"></div>
      </div>
    </>
  )
}
