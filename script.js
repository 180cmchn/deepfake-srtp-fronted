// 全局配置
const API_BASE_URL = 'http://localhost:8000/api/v1';
let currentFiles = [];
let trendChart = null;

// 调试模式
const DEBUG = true;

function debugLog(message, data = null) {
    if (DEBUG) {
        console.log(`[DEBUG] ${message}`, data);
    }
}

// DOM 元素
const elements = {
    fileInput: document.getElementById('fileInput'),
    uploadArea: document.getElementById('uploadArea'),
    detectBtn: document.getElementById('detectBtn'),
    modelSelect: document.getElementById('modelSelect'),
    resultsSection: document.getElementById('resultsSection'),
    resultsContainer: document.getElementById('resultsContainer'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    notification: document.getElementById('notification'),
    historyTableBody: document.getElementById('historyTableBody'),
    modelsGrid: document.getElementById('modelsGrid'),
    historyFilter: document.getElementById('historyFilter'),
    modelFilter: document.getElementById('modelFilter')
};

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    setupNavigation();
    loadAvailableModels();
    loadStatistics();
}

// 设置事件监听器
function setupEventListeners() {
    // 文件上传相关
    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.detectBtn.addEventListener('click', startDetection);
    
    // 拖拽上传
    elements.uploadArea.addEventListener('dragover', handleDragOver);
    elements.uploadArea.addEventListener('dragleave', handleDragLeave);
    elements.uploadArea.addEventListener('drop', handleDrop);
    
    // 点击上传区域
    elements.uploadArea.addEventListener('click', () => {
        elements.fileInput.click();
    });
}

// 设置导航
function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const section = link.dataset.section;
            switchSection(section);
            
            // 更新导航状态
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            // 加载对应数据
            if (section === 'history') {
                loadHistory();
            } else if (section === 'models') {
                loadModels();
            } else if (section === 'statistics') {
                loadStatistics();
            }
        });
    });
}

// 切换页面部分
function switchSection(sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
}

// 文件处理函数
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    addFiles(files);
}

function handleDragOver(event) {
    event.preventDefault();
    elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(event) {
    event.preventDefault();
    elements.uploadArea.classList.remove('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    elements.uploadArea.classList.remove('dragover');
    
    const files = Array.from(event.dataTransfer.files);
    addFiles(files);
}

function addFiles(files) {
    const validFiles = files.filter(file => {
        const isValidType = file.type.startsWith('image/') || file.type.startsWith('video/');
        const isValidSize = file.size <= 100 * 1024 * 1024; // 100MB
        
        if (!isValidType) {
            showNotification(`文件 ${file.name} 格式不支持`, 'error');
            return false;
        }
        
        if (!isValidSize) {
            showNotification(`文件 ${file.name} 超过 100MB 限制`, 'error');
            return false;
        }
        
        return true;
    });
    
    currentFiles = [...currentFiles, ...validFiles];
    updateUploadArea();
    elements.detectBtn.disabled = currentFiles.length === 0;
    
    if (validFiles.length > 0) {
        showNotification(`已添加 ${validFiles.length} 个文件`, 'success');
    }
}

function updateUploadArea() {
    if (currentFiles.length > 0) {
        const fileNames = currentFiles.map(f => f.name).join(', ');
        elements.uploadArea.querySelector('h3').textContent = `已选择 ${currentFiles.length} 个文件`;
        elements.uploadArea.querySelector('p').textContent = fileNames.length > 50 ? 
            fileNames.substring(0, 50) + '...' : fileNames;
    } else {
        elements.uploadArea.querySelector('h3').textContent = '拖拽文件到此处或点击选择';
        elements.uploadArea.querySelector('p').textContent = '支持 JPG, PNG, MP4, AVI, MOV 格式';
    }
}

// 检测功能
async function startDetection() {
    if (currentFiles.length === 0) {
        showNotification('请先选择文件', 'warning');
        return;
    }
    
    debugLog('开始检测', { fileCount: currentFiles.length, model: elements.modelSelect.value });
    
    showLoading(true);
    elements.resultsSection.style.display = 'none';
    
    try {
        const results = [];
        
        for (const file of currentFiles) {
            debugLog('处理文件', { name: file.name, size: file.size, type: file.type });
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model_type', elements.modelSelect.value);
            
            debugLog('发送请求', { url: `${API_BASE_URL}/detection/detect`, model: elements.modelSelect.value });
            
            const response = await axios.post(`${API_BASE_URL}/detection/detect`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 30000 // 30秒超时
            });
            
            debugLog('收到响应', response.data);
            
            results.push({
                file: file,
                result: response.data
            });
        }
        
        displayResults(results);
        showNotification('检测完成！', 'success');
        
    } catch (error) {
        debugLog('检测错误', error);
        
        let errorMessage = '检测失败';
        
        if (error.code === 'ECONNREFUSED') {
            errorMessage = '无法连接到后端服务，请确保后端在 http://localhost:8000 运行';
        } else if (error.code === 'NETWORK_ERROR') {
            errorMessage = '网络错误，请检查网络连接';
        } else if (error.response) {
            // 服务器返回了错误状态码
            if (error.response.status === 422) {
                errorMessage = '文件格式或参数错误';
            } else if (error.response.status === 500) {
                errorMessage = '服务器内部错误';
            } else {
                errorMessage = `服务器错误 (${error.response.status})`;
            }
            
            if (error.response.data && error.response.data.detail) {
                errorMessage += ': ' + error.response.data.detail;
            }
        } else if (error.request) {
            errorMessage = '请求超时，请重试';
        } else {
            errorMessage = error.message || '未知错误';
        }
        
        showNotification(errorMessage, 'error');
        
        // 显示模拟结果用于演示
        if (DEBUG && currentFiles.length > 0) {
            showMockResults();
        }
        
    } finally {
        showLoading(false);
    }
}

function displayResults(results) {
    elements.resultsContainer.innerHTML = '';
    
    results.forEach(({ file, result }) => {
        const resultCard = createResultCard(file, result);
        elements.resultsContainer.appendChild(resultCard);
    });
    
    elements.resultsSection.style.display = 'block';
}

function createResultCard(file, result) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    const isVideo = file.type.startsWith('video/');
    const previewUrl = isVideo ? 
        URL.createObjectURL(file) : 
        URL.createObjectURL(file);
    
    const prediction = result.prediction;
    const confidence = result.confidence;
    const confidencePercent = Math.round(confidence * 100);
    
    card.innerHTML = `
        <div class="result-preview">
            ${isVideo ? 
                `<video src="${previewUrl}" controls style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;"></video>` :
                `<img src="${previewUrl}" alt="${file.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 8px;">`
            }
        </div>
        <div class="result-info">
            <div class="result-filename">${file.name}</div>
            <div class="result-details">
                <div class="result-detail">
                    <i class="fas fa-brain"></i>
                    <span>模型: ${result.model_type || elements.modelSelect.value}</span>
                </div>
                <div class="result-detail">
                    <i class="fas fa-clock"></i>
                    <span>时间: ${new Date().toLocaleString()}</span>
                </div>
            </div>
            <div class="result-details">
                <div class="result-detail">
                    <span class="result-badge ${prediction}">${prediction === 'real' ? '真实' : '伪造'}</span>
                </div>
                <div class="result-detail">
                    <span>置信度: ${confidencePercent}%</span>
                </div>
            </div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidencePercent}%"></div>
            </div>
        </div>
    `;
    
    return card;
}

// 历史记录功能
async function loadHistory() {
    try {
        const prediction = elements.historyFilter.value;
        const modelType = elements.modelFilter.value;
        
        const params = new URLSearchParams();
        if (prediction) params.append('prediction', prediction);
        if (modelType) params.append('model_type', modelType);
        
        const response = await axios.get(`${API_BASE_URL}/detection/history?${params}`);
        displayHistory(response.data.items || []);
        
    } catch (error) {
        console.error('Load history error:', error);
        elements.historyTableBody.innerHTML = '<tr><td colspan="6" class="loading">加载失败</td></tr>';
    }
}

function displayHistory(history) {
    if (history.length === 0) {
        elements.historyTableBody.innerHTML = '<tr><td colspan="6" class="loading">暂无记录</td></tr>';
        return;
    }
    
    elements.historyTableBody.innerHTML = history.map(record => `
        <tr>
            <td>${new Date(record.created_at).toLocaleString()}</td>
            <td>${record.file_name}</td>
            <td>${record.model_type}</td>
            <td><span class="result-badge ${record.prediction}">${record.prediction === 'real' ? '真实' : '伪造'}</span></td>
            <td>${Math.round(record.confidence * 100)}%</td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteHistoryRecord(${record.id})">
                    <i class="fas fa-trash"></i> 删除
                </button>
            </td>
        </tr>
    `).join('');
}

async function deleteHistoryRecord(recordId) {
    if (!confirm('确定要删除这条记录吗？')) {
        return;
    }
    
    try {
        await axios.delete(`${API_BASE_URL}/detection/history/${recordId}`);
        showNotification('记录已删除', 'success');
        loadHistory();
    } catch (error) {
        console.error('Delete record error:', error);
        showNotification('删除失败', 'error');
    }
}

// 模型管理功能
async function loadAvailableModels() {
    try {
        const response = await axios.get(`${API_BASE_URL}/detection/models`);
        updateModelSelect(response.data.models || []);
    } catch (error) {
        console.error('Load models error:', error);
        // 使用默认模型列表
        updateModelSelect(['vgg', 'lrcn', 'swin', 'vit', 'resnet']);
    }
}

function updateModelSelect(models) {
    elements.modelSelect.innerHTML = models.map(model => 
        `<option value="${model}">${model.toUpperCase()}</option>`
    ).join('');
}

async function loadModels() {
    try {
        const response = await axios.get(`${API_BASE_URL}/models`);
        displayModels(response.data.items || []);
    } catch (error) {
        console.error('Load models error:', error);
        elements.modelsGrid.innerHTML = '<div class="loading">加载失败</div>';
    }
}

function displayModels(models) {
    if (models.length === 0) {
        elements.modelsGrid.innerHTML = '<div class="loading">暂无模型</div>';
        return;
    }
    
    elements.modelsGrid.innerHTML = models.map(model => `
        <div class="model-card">
            <div class="model-header">
                <div class="model-icon">
                    <i class="fas fa-brain"></i>
                </div>
                <div>
                    <div class="model-name">${model.name}</div>
                    <span class="model-status ${model.status === 'active' ? 'active' : 'inactive'}">
                        ${model.status === 'active' ? '活跃' : '未激活'}
                    </span>
                </div>
            </div>
            <div class="model-stats">
                <div class="model-stat">
                    <div class="model-stat-value">${model.accuracy || '-'}</div>
                    <div class="model-stat-label">准确率</div>
                </div>
                <div class="model-stat">
                    <div class="model-stat-value">${model.detections || 0}</div>
                    <div class="model-stat-label">检测次数</div>
                </div>
            </div>
        </div>
    `).join('');
}

// 统计功能
async function loadStatistics() {
    try {
        const response = await axios.get(`${API_BASE_URL}/detection/statistics`);
        displayStatistics(response.data);
        updateTrendChart(response.data.trend || []);
    } catch (error) {
        console.error('Load statistics error:', error);
        // 显示模拟统计数据
        displayMockStatistics();
    }
}

function displayStatistics(stats) {
    document.getElementById('totalDetections').textContent = stats.total_detections || 0;
    document.getElementById('realCount').textContent = stats.real_count || 0;
    document.getElementById('fakeCount').textContent = stats.fake_count || 0;
    document.getElementById('accuracy').textContent = stats.average_accuracy ? 
        Math.round(stats.average_accuracy * 100) + '%' : '-';
}

function updateTrendChart(trendData) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    if (trendChart) {
        trendChart.destroy();
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.map(item => new Date(item.date).toLocaleDateString()),
            datasets: [{
                label: '检测次数',
                data: trendData.map(item => item.count),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// 模拟统计数据功能
function displayMockStatistics() {
    debugLog('显示模拟统计数据');
    
    const mockStats = {
        total_detections: Math.floor(Math.random() * 1000) + 100,
        real_count: Math.floor(Math.random() * 600) + 50,
        fake_count: Math.floor(Math.random() * 400) + 50,
        average_accuracy: 0.85 + Math.random() * 0.1
    };
    
    displayStatistics(mockStats);
    
    // 生成模拟趋势数据
    const mockTrend = [];
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        mockTrend.push({
            date: date.toISOString(),
            count: Math.floor(Math.random() * 50) + 5
        });
    }
    updateTrendChart(mockTrend);
    
    showNotification('显示模拟统计数据（演示模式）', 'warning');
}

// 模拟结果功能（用于演示）
function showMockResults() {
    debugLog('显示模拟结果');
    
    const mockResults = currentFiles.map(file => ({
        file: file,
        result: {
            prediction: Math.random() > 0.5 ? 'real' : 'fake',
            confidence: 0.7 + Math.random() * 0.3, // 0.7-1.0
            model_type: elements.modelSelect.value,
            processing_time: Math.round(Math.random() * 5 + 1) // 1-6秒
        }
    }));
    
    displayResults(mockResults);
    showNotification('显示模拟结果（演示模式）', 'warning');
}

// 工具函数
function showLoading(show) {
    if (show) {
        elements.loadingOverlay.classList.add('show');
    } else {
        elements.loadingOverlay.classList.remove('show');
    }
}

function showNotification(message, type = 'info') {
    elements.notification.textContent = message;
    elements.notification.className = `notification ${type}`;
    elements.notification.classList.add('show');
    
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

// 错误处理
window.addEventListener('error', function(event) {
    console.error('Global error:', event.error);
    showNotification('发生了一个错误，请刷新页面重试', 'error');
});

// 网络状态监听
window.addEventListener('online', function() {
    showNotification('网络连接已恢复', 'success');
});

window.addEventListener('offline', function() {
    showNotification('网络连接已断开', 'warning');
});
