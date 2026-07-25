// Set up PDF.js worker
if (typeof window.pdfjsLib !== 'undefined') {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
}

document.addEventListener('DOMContentLoaded', async () => {
  // ---- Element References ----
  const resumeEmpty = document.getElementById('resumeEmpty');
  const resumeCached = document.getElementById('resumeCached');
  const resumeFileName = document.getElementById('resumeFileName');
  const resumeUpload = document.getElementById('resumeUpload');
  const replaceResumeBtn = document.getElementById('replaceResumeBtn');
  const clearResumeBtn = document.getElementById('clearResumeBtn');
  const jobDescription = document.getElementById('jobDescription');
  const customInstructions = document.getElementById('customInstructions');
  const targetFieldNameInput = document.getElementById('targetFieldName');
  const autoPasteToggle = document.getElementById('autoPasteToggle');
  const generateBtn = document.getElementById('generateBtn');
  const errorAlert = document.getElementById('errorAlert');
  const mainArea = document.getElementById('mainArea');
  const loadingArea = document.getElementById('loadingArea');
  const successArea = document.getElementById('successArea');
  const resultPreview = document.getElementById('resultPreview');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const copyBtn = document.getElementById('copyBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  const resetBtn = document.getElementById('resetBtn');
  const autoPasteStatus = document.getElementById('autoPasteStatus');
  const autoPasteMessage = document.getElementById('autoPasteMessage');

  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const toggleApiKeyVisibilityBtn = document.getElementById('toggleApiKeyVisibility');
  const testKeyBtn = document.getElementById('testKeyBtn');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const apiStatusMessage = document.getElementById('apiStatusMessage');

  let cachedResumeText = '';
  let cachedFileName = '';
  let generatedLetter = '';     // Raw text with **bold** markers
  let cleanLetter = '';         // Text stripped of bold markers
  let userApiKey = '';

  const API_URL = 'http://localhost:5000/api/generate';
  const API_TEST_URL = 'http://localhost:5000/api/test-key';

  // ---- Initialize ----
  await loadCachedResume();
  await loadPreferences();
  await loadApiKey();

  // ---- Event Listeners ----
  resumeUpload.addEventListener('change', handleFileUpload);
  replaceResumeBtn.addEventListener('click', () => resumeUpload.click());
  clearResumeBtn.addEventListener('click', clearResume);
  generateBtn.addEventListener('click', handleGenerate);
  downloadPdfBtn.addEventListener('click', () => downloadPDF(generatedLetter));
  copyBtn.addEventListener('click', handleCopy);
  resetBtn.addEventListener('click', resetUI);
  autoPasteToggle.addEventListener('change', savePreferences);
  targetFieldNameInput.addEventListener('input', savePreferences);

  toggleApiKeyVisibilityBtn.addEventListener('click', () => {
    const type = geminiApiKeyInput.getAttribute('type') === 'password' ? 'text' : 'password';
    geminiApiKeyInput.setAttribute('type', type);
  });
  saveKeyBtn.addEventListener('click', saveApiKey);
  testKeyBtn.addEventListener('click', testApiKey);

  // =====================
  //  RESUME MANAGEMENT
  // =====================

  async function loadCachedResume() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['resumeText', 'fileName'], (data) => {
        if (data.resumeText) {
          cachedResumeText = data.resumeText;
          cachedFileName = data.fileName || '';
          showResumeCached(cachedFileName);
        } else {
          showResumeEmpty();
        }
        resolve();
      });
    });
  }

  function showResumeCached(fileName) {
    resumeEmpty.classList.add('hidden');
    resumeCached.classList.remove('hidden');
    resumeFileName.textContent = fileName || 'Resume loaded';
    resumeFileName.title = fileName || '';
  }

  function showResumeEmpty() {
    resumeCached.classList.add('hidden');
    resumeEmpty.classList.remove('hidden');
    resumeFileName.textContent = '';
  }

  function clearResume() {
    chrome.storage.local.remove(['resumeText', 'fileName'], () => {
      cachedResumeText = '';
      cachedFileName = '';
      showResumeEmpty();
    });
  }

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    hideError();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      if (!fullText.trim()) {
        throw new Error('Could not extract text. The PDF may be scanned/image-based.');
      }

      cachedResumeText = fullText.trim();
      cachedFileName = file.name;
      chrome.storage.local.set({ resumeText: cachedResumeText, fileName: file.name });
      showResumeCached(file.name);
    } catch (err) {
      console.error('PDF parsing error:', err);
      showError('Failed to parse PDF. Please try another file.');
    }
    resumeUpload.value = '';
  }

  // =====================
  //  PREFERENCES (State)
  // =====================

  async function loadPreferences() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['autoPasteEnabled', 'targetFieldName'], (data) => {
        autoPasteToggle.checked = data.autoPasteEnabled !== undefined ? data.autoPasteEnabled : true;
        targetFieldNameInput.value = data.targetFieldName !== undefined ? data.targetFieldName : 'Cover letter';
        resolve();
      });
    });
  }

  function savePreferences() {
    chrome.storage.local.set({
      autoPasteEnabled: autoPasteToggle.checked,
      targetFieldName: targetFieldNameInput.value.trim()
    });
  }

  // =====================
  //  API KEY MANAGEMENT
  // =====================

  async function loadApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey'], (data) => {
        if (data.geminiApiKey) {
          userApiKey = data.geminiApiKey;
          geminiApiKeyInput.value = userApiKey;
        }
        resolve();
      });
    });
  }

  function saveApiKey() {
    const key = geminiApiKeyInput.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      userApiKey = key;
      setApiStatus('Saved locally!', 'success');
    });
  }

  async function testApiKey() {
    const key = geminiApiKeyInput.value.trim();
    if (!key) {
      setApiStatus('Please enter an API key to test.', 'error');
      return;
    }

    testKeyBtn.disabled = true;
    setApiStatus('Testing key...', 'success');
    apiStatusMessage.style.color = 'var(--text-secondary)';

    try {
      const response = await fetch(API_TEST_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': key
        }
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setApiStatus('Valid API Key!', 'success');
        userApiKey = key;
        chrome.storage.local.set({ geminiApiKey: key });
      } else {
        setApiStatus(data.message || data.error || 'Invalid API Key', 'error');
      }
    } catch (err) {
      setApiStatus('Failed to connect to backend', 'error');
    } finally {
      testKeyBtn.disabled = false;
    }
  }

  function setApiStatus(message, type) {
    apiStatusMessage.textContent = message;
    apiStatusMessage.className = `status-msg status-${type}`;
    apiStatusMessage.classList.remove('hidden');
    setTimeout(() => {
      apiStatusMessage.classList.add('hidden');
    }, 4000);
  }

  // =====================
  //  DYNAMIC PDF FILENAME GENERATOR
  // =====================

  function getPdfFilename() {
    const rawName = cachedFileName || 'Candidate';
    let base = rawName.replace(/\.[^/.]+$/, '');
    let words = base.replace(/[-_.,]/g, ' ').split(/\s+/).filter(Boolean);

    const noiseWords = new Set([
      'resume', 'cv', 'curriculum', 'vitae', 'pdf', 'doc', 'docx', 'v1', 'v2', 'v3',
      'final', 'updated', 'copy', 'new', '2023', '2024', '2025', '2026', 'software',
      'engineer', 'developer', 'development', 'frontend', 'backend', 'fullstack', 'lead'
    ]);

    let cleanWords = words.filter(w => !noiseWords.has(w.toLowerCase()));

    if (cleanWords.length < 2 && words.length >= 2) {
      cleanWords = words.slice(0, 2);
    }
    if (cleanWords.length === 0) {
      cleanWords = ['Candidate'];
    }

    const formattedName = cleanWords
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join('_');

    return `${formattedName}_Cover_Letter.pdf`;
  }

  // =====================
  //  GENERATION
  // =====================

  async function handleGenerate() {
    const jdText = jobDescription.value.trim();
    const customText = customInstructions.value.trim();

    if (!userApiKey) {
      showError('Please configure your Gemini API Key in the settings above.');
      return;
    }
    if (!cachedResumeText) {
      showError('Please upload a resume first.');
      return;
    }
    if (!jdText) {
      showError('Please paste a job description.');
      return;
    }

    hideError();
    generateBtn.disabled = true;
    mainArea.classList.add('hidden');
    loadingArea.classList.remove('hidden');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': userApiKey
        },
        body: JSON.stringify({
          resumeText: cachedResumeText,
          jobDescription: jdText,
          customInstructions: customText
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.coverLetter) {
        throw new Error(data.error || 'Failed to generate cover letter.');
      }

      generatedLetter = data.coverLetter;
      cleanLetter = stripBoldMarkers(generatedLetter);

      // Show success UI
      loadingArea.classList.add('hidden');
      successArea.classList.remove('hidden');

      // Render preview with bold HTML
      resultPreview.innerHTML = renderBoldAsHTML(generatedLetter);

      // Auto-attach / Auto-paste if enabled
      if (autoPasteToggle.checked) {
        await attemptAutoPaste(generatedLetter, cleanLetter);
      }

    } catch (err) {
      loadingArea.classList.add('hidden');
      mainArea.classList.remove('hidden');
      showError(err.message || 'Generation failed. Is the backend server running?');
    } finally {
      generateBtn.disabled = false;
    }
  }

  // =====================
  //  BOLD TEXT HANDLING
  // =====================

  function stripBoldMarkers(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
  }

  function renderBoldAsHTML(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // =====================
  //  PDF GENERATION
  // =====================

  function buildPdfDoc(textWithBolds) {
    if (typeof window.jspdf === 'undefined') return null;
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
      format: 'letter',
      unit: 'pt',
      orientation: 'portrait'
    });

    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 72; // 1-inch margins
    const maxWidth = pageWidth - margin * 2;
    
    let fontSize = 11;
    const lineHeightFactor = 1.5;
    let lineHeight = fontSize * lineHeightFactor;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fontSize);

    // Helper to calculate total height to auto-scale font if letter is too long
    function simulateRenderHeight(size) {
        doc.setFontSize(size);
        const lh = size * lineHeightFactor;
        let simY = margin + size;
        const paragraphs = textWithBolds.split(/\n\n+/);
        
        for (const para of paragraphs) {
            let x = margin;
            const parts = para.split('**');
            for (let i = 0; i < parts.length; i++) {
                doc.setFont('Helvetica', i % 2 !== 0 ? 'bold' : 'normal');
                const chunks = parts[i].match(/\S+|\s+/g) || [];
                for (const chunk of chunks) {
                    const w = doc.getTextWidth(chunk);
                    if (/\S/.test(chunk) && x + w > margin + maxWidth && x !== margin) {
                        simY += lh;
                        x = margin;
                    } else if (/^\s+$/.test(chunk) && x === margin) {
                        continue;
                    }
                    x += w;
                }
            }
            simY += lh * 1.5; // paragraph spacing
        }
        return simY;
    }

    // Shrink font size if text exceeds page height
    while (simulateRenderHeight(fontSize) > pageHeight - margin && fontSize > 8.5) {
        fontSize -= 0.5;
    }

    // Actual render
    doc.setFontSize(fontSize);
    lineHeight = fontSize * lineHeightFactor;
    let y = margin + fontSize;
    const paragraphs = textWithBolds.split(/\n\n+/);
    
    for (const para of paragraphs) {
        let x = margin;
        const parts = para.split('**');
        
        for (let i = 0; i < parts.length; i++) {
            doc.setFont('Helvetica', i % 2 !== 0 ? 'bold' : 'normal');
            const chunks = parts[i].match(/\S+|\s+/g) || [];
            
            for (const chunk of chunks) {
                const w = doc.getTextWidth(chunk);
                
                // Wrap to next line if word overflows
                if (/\S/.test(chunk) && x + w > margin + maxWidth && x !== margin) {
                    y += lineHeight;
                    x = margin;
                } 
                // Skip leading spaces at the start of a new line
                else if (/^\s+$/.test(chunk) && x === margin) {
                    continue;
                }
                
                doc.text(chunk, x, y);
                x += w;
            }
        }
        y += lineHeight * 1.5; // space between paragraphs
    }

    return doc;
  }

  function downloadPDF(text) {
    const doc = buildPdfDoc(text);
    if (doc) {
      const outputFilename = getPdfFilename();
      doc.save(outputFilename);
    }
  }

  function getPdfBase64(text) {
    const doc = buildPdfDoc(text);
    if (!doc) return null;
    const dataUri = doc.output('datauristring');
    return dataUri.split(',')[1];
  }

  // =====================
  //  UNIVERSAL INJECTION ENGINE
  // =====================

  async function attemptAutoPaste(textWithBolds, cleanText) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        showAutoPasteResult(false, 'No active tab found');
        return;
      }

      const pdfBase64 = getPdfBase64(textWithBolds);
      const pdfFilename = getPdfFilename();
      const customTargetField = targetFieldNameInput.value.trim();

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: universalInjector,
        args: [cleanText, pdfBase64, pdfFilename, customTargetField]
      });

      const successResult = results?.find(r => r?.result?.success);
      if (successResult) {
        showAutoPasteResult(true, successResult.result.message || 'Attached/pasted successfully!');
      } else {
        await navigator.clipboard.writeText(cleanText);
        showAutoPasteResult(false, 'No matching field found — copied letter to clipboard (Cmd+V / Ctrl+V)');
      }
    } catch (err) {
      console.error('Universal injection error:', err);
      try {
        await navigator.clipboard.writeText(cleanText);
        showAutoPasteResult(false, 'Copied letter to clipboard (Cmd+V / Ctrl+V)');
      } catch (e) {
        showAutoPasteResult(false, 'Cannot access page');
      }
    }
  }

  // =========================================================
  // UNIVERSAL INJECTOR SCRIPT (Runs inside web page & iframes)
  // =========================================================
  function universalInjector(text, pdfBase64, pdfFilename, customTargetField) {

    function queryAllDeep(selector, root = document) {
      let elements = Array.from(root.querySelectorAll(selector));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
      let node = walker.nextNode();
      while (node) {
        if (node.shadowRoot) {
          elements = elements.concat(queryAllDeep(selector, node.shadowRoot));
        }
        node = walker.nextNode();
      }
      return elements;
    }

    function dispatchFrameworkEvents(element, value) {
      element.focus();

      const prototype = element.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : element.tagName === 'INPUT'
          ? HTMLInputElement.prototype
          : null;

      if (prototype) {
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) {
          setter.call(element, value);
        } else {
          element.value = value;
        }
      } else {
        element.value = value;
      }

      element.dispatchEvent(new Event('keydown', { bubbles: true }));
      element.dispatchEvent(new Event('keypress', { bubbles: true }));
      element.dispatchEvent(new Event('keyup', { bubbles: true }));
      element.dispatchEvent(new Event('beforeinput', { bubbles: true }));
      element.dispatchEvent(new Event('input', { bubbles: true, inputType: 'insertText' }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function attachPdfToFileInput(fileInput) {
      if (!pdfBase64) return false;
      try {
        const byteCharacters = atob(pdfBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const file = new File([blob], pdfFilename || 'Cover_Letter.pdf', { type: 'application/pdf' });

        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        fileInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      } catch (err) {
        console.error('Failed to attach PDF:', err);
        return false;
      }
    }

    function populateTargetInput(targetInput, text, pdfBase64, pdfFilename) {
      if (!targetInput) return false;
      if (targetInput.tagName === 'INPUT' && targetInput.type === 'file') {
        return attachPdfToFileInput(targetInput);
      } else if (targetInput.tagName === 'TEXTAREA' || (targetInput.tagName === 'INPUT' && targetInput.type === 'text')) {
        dispatchFrameworkEvents(targetInput, text);
        return true;
      } else if (targetInput.getAttribute('contenteditable') === 'true' || targetInput.classList.contains('ql-editor')) {
        targetInput.innerHTML = text.split('\n\n').map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      return false;
    }

    // Helper: Check if element or its immediate parent card text is a Resume field
    function isResumeInputOrCard(input) {
      if (!input) return false;

      const attrs = [
        input.name, input.id, input.getAttribute('aria-label'),
        input.getAttribute('placeholder'), input.getAttribute('title')
      ].filter(Boolean).join(' ').toLowerCase();

      if ((attrs.includes('resume') || attrs.includes('cv') || attrs.includes('curriculum')) && !attrs.includes('cover')) {
        return true;
      }

      let curr = input.parentElement;
      for (let i = 0; i < 3 && curr; i++) {
        if (['FORM', 'BODY', 'MAIN'].includes(curr.tagName)) break;
        const text = (curr.innerText || curr.textContent || '').toLowerCase();
        if ((text.includes('resume') || text.includes('cv')) && !text.includes('cover')) {
          return true;
        }
        curr = curr.parentElement;
      }
      return false;
    }

    // ================================================================
    // UNIVERSAL MULTI-STRATEGY INJECTION ENGINE
    // ================================================================
    const searchTerms = [];
    if (customTargetField && customTargetField.trim().length > 0) {
      searchTerms.push(customTargetField.trim().toLowerCase());
    }
    searchTerms.push('cover letter', 'coverletter', 'cover_letter', 'letter of intent', 'motivation letter', 'pitch');

    const allInputs = queryAllDeep('input[type="file"], textarea, [contenteditable="true"], .ql-editor');

    // ----------------------------------------------------
    // STRATEGY 1: TreeWalker Atomic Text Node Search
    // ----------------------------------------------------
    const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let matchedLabelElements = [];

    while (treeWalker.nextNode()) {
      const textNode = treeWalker.currentNode;
      const nodeText = textNode.textContent.trim().toLowerCase();
      if (!nodeText) continue;

      for (const term of searchTerms) {
        if (nodeText.includes(term)) {
          const parentEl = textNode.parentElement;
          if (parentEl && !isResumeInputOrCard(parentEl)) {
            matchedLabelElements.push({ el: parentEl, term });
          }
          break;
        }
      }
    }

    // Process matched label elements starting from closest to inputs
    for (const { el, term } of matchedLabelElements) {
      // 1A. Check <label for="id"> link
      if (el.htmlFor) {
        const target = document.getElementById(el.htmlFor);
        if (target && !isResumeInputOrCard(target) && populateTargetInput(target, text, pdfBase64, pdfFilename)) {
          const msg = target.type === 'file' ? `Attached ${pdfFilename} to upload zone` : 'Pasted text into field';
          return { success: true, message: `${msg} (matched "${term}")` };
        }
      }

      // 1B. Find inputs FOLLOWING this label node in document order (filtering out Resume inputs)
      const candidatesAfterLabel = allInputs.filter(input => {
        if (isResumeInputOrCard(input)) return false;
        const position = el.compareDocumentPosition(input);
        return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      });

      if (candidatesAfterLabel.length > 0) {
        const targetInput = candidatesAfterLabel[0];
        if (populateTargetInput(targetInput, text, pdfBase64, pdfFilename)) {
          const msg = targetInput.type === 'file' ? `Attached ${pdfFilename} to upload zone` : 'Pasted text into field';
          return { success: true, message: `${msg} (matched "${term}")` };
        }
      }
    }

    // ----------------------------------------------------
    // STRATEGY 2: Direct Attribute Match (input name/id/placeholder/aria-label)
    // ----------------------------------------------------
    for (const input of allInputs) {
      if (isResumeInputOrCard(input)) continue;

      const attrs = [
        input.name, input.id, input.getAttribute('aria-label'),
        input.getAttribute('placeholder'), input.getAttribute('title')
      ].filter(Boolean).join(' ').toLowerCase();

      for (const term of searchTerms) {
        if (attrs.includes(term)) {
          if (populateTargetInput(input, text, pdfBase64, pdfFilename)) {
            const msg = input.type === 'file' ? `Attached ${pdfFilename} to upload zone` : 'Pasted text into field';
            return { success: true, message: `${msg} (matched attribute "${term}")` };
          }
        }
      }
    }

    // ----------------------------------------------------
    // STRATEGY 3: Fallback - Largest Non-Resume Textarea
    // ----------------------------------------------------
    const validTextareas = allInputs.filter(inp => {
      return (inp.tagName === 'TEXTAREA' || inp.getAttribute('contenteditable') === 'true' || inp.classList.contains('ql-editor'))
             && !isResumeInputOrCard(inp);
    });

    if (validTextareas.length > 0) {
      if (populateTargetInput(validTextareas[0], text, pdfBase64, pdfFilename)) {
        return { success: true, message: 'Pasted cover letter into field' };
      }
    }

    return { success: false, message: 'No cover letter field found on page' };
  }

  // =====================
  //  CLIPBOARD
  // =====================

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(cleanLetter);
      copyBtnText.textContent = 'Copied ✓';
      copyBtn.style.borderColor = 'var(--success)';
      copyBtn.style.color = 'var(--success)';

      setTimeout(() => {
        copyBtnText.textContent = 'Copy Text';
        copyBtn.style.borderColor = '';
        copyBtn.style.color = '';
      }, 2000);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = cleanLetter;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copyBtnText.textContent = 'Copied ✓';
      setTimeout(() => { copyBtnText.textContent = 'Copy Text'; }, 2000);
    }
  }

  // =====================
  //  UI HELPERS
  // =====================

  function showAutoPasteResult(success, message) {
    autoPasteStatus.classList.remove('hidden', 'alert-success', 'alert-error', 'alert-info');
    if (success) {
      autoPasteStatus.classList.add('alert-success');
    } else {
      autoPasteStatus.classList.add('alert-error');
    }
    autoPasteMessage.textContent = message;
  }

  function resetUI() {
    generatedLetter = '';
    cleanLetter = '';
    successArea.classList.add('hidden');
    autoPasteStatus.classList.add('hidden');
    mainArea.classList.remove('hidden');
  }

  function showError(msg) {
    errorAlert.textContent = msg;
    errorAlert.classList.remove('hidden');
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }
});
