// 全局变量
let uploadedFiles = [];
let currentSection = 'detection';
let trendChart = null;

// 页面配置
const pageConfig = {
    detection: {
        title: 'Deepfake 检测',
        subtitle: '上传图片或视频文件进行深度伪造检测'
    },
    history: {
        title: '检测历史',
        subtitle: '查看所有检测记录和结果'
    },
    models: {
        title: '模型管理',
        subtitle: '管理和查看可用的检测模型'
    },
    training: {
        title: '模型训练',
        subtitle: '创建和管理模型训练任务'
    },
    statistics: {
        title: '统计信息',
        subtitle: '查看平台使用统计和检测性能'
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initializeNavigation();
    initializeFileUpload();
    initializeDetection();
    initializeTraining();
    loadHistory();
    loadModels();
    loadTrainingJobs();
    loadStatistics();
});

// 导航功能
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const section = this.dataset.section;
            switchSection(section);
        });
    });
}

function switchSection(sectionName) {
    // 更新导航状态
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-primary-100', 'text-primary-700', 'border-r-2', 'border-primary-700');
        link.classList.add('text-gray-600', 'hover:bg-gray-50', 'hover:text-gray-900');
        
        const icon = link.querySelector('i');
        icon.classList.remove('text-primary-700');
        icon.classList.add('text-gray-400');
    });
    
    const activeLink = document.querySelector(`[data-section="${sectionName}"]`);
    activeLink.classList.remove('text-gray-600', 'hover:bg-gray-50', 'hover:text-gray-900');
    activeLink.classList.add('bg-primary-100', 'text-primary-700', 'border-r-2', 'border-primary-700');
    
    const activeIcon = activeLink.querySelector('i');
    activeIcon.classList.remove('text-gray-400');
    activeIcon.classList.add('text-primary-700');
    
    // 切换内容区域
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('fade-in');
    });
    
    const targetSection = document.getElementById(sectionName);
    targetSection.classList.remove('hidden');
    setTimeout(() => {
        targetSection.classList.add('fade-in');
    }, 10);
    
    // 更新页面标题
    const pageTitle = document.getElementById('pageTitle');
    const pageSubtitle = document.getElementById('pageSubtitle');
    pageTitle.textContent = pageConfig[sectionName].title;
    pageSubtitle.textContent = pageConfig[sectionName].subtitle;
    
    currentSection = sectionName;
}

// 文件上传功能
function initializeFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const detectBtn = document.getElementById('detectBtn');
    
    if (!uploadArea || !fileInput) return;
    
    // 点击上传区域
    uploadArea.addEventListener('click', function(e) {
        if (e.target.tagName !== 'BUTTON') {
            fileInput.click();
        }
    });
    
    // 拖拽功能
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('border-primary-500', 'bg-primary-50');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('border-primary-500', 'bg-primary-50');
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('border-primary-500', 'bg-primary-50');
        handleFiles(e.dataTransfer.files);
    });
    
    // 文件选择
    fileInput.addEventListener('change', function(e) {
        handleFiles(e.target.files);
    });
}

function handleFiles(files) {
    uploadedFiles = Array.from(files);
    const validFiles = uploadedFiles.filter(file => {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/avi', 'video/mov'];
        const maxSize = 100 * 1024 * 1024; // 100MB
        
        if (!validTypes.includes(file.type)) {
            showNotification(`文件 ${file.name} 格式不支持`, 'error');
            return false;
        }
        
        if (file.size > maxSize) {
            showNotification(`文件 ${file.name} 超过100MB限制`, 'error');
            return false;
        }
        
        return true;
    });
    
    if (validFiles.length > 0) {
        document.getElementById('detectBtn').disabled = false;
        updateUploadArea(validFiles);
        showNotification(`已选择 ${validFiles.length} 个文件`, 'success');
    }
}

function updateUploadArea(files) {
    const uploadContent = document.querySelector('.upload-content');
    const fileList = files.map(file => `
        <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200 mb-2">
            <div class="flex items-center">
                <i class="fas fa-file-${file.type.startsWith('image/') ? 'image' : 'video'} text-gray-400 mr-2"></i>
                <span class="text-sm text-gray-700">${file.name}</span>
            </div>
            <span class="text-xs text-gray-500">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
        </div>
    `).join('');
    
    uploadContent.innerHTML = `
        <i class="fas fa-check-circle upload-icon text-4xl text-green-500 mb-4"></i>
        <h3 class="text-lg font-medium text-gray-900 mb-2">已选择文件</h3>
        <div class="w-full max-h-40 overflow-y-auto mb-4">${fileList}</div>
        <button class="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors" onclick="document.getElementById('fileInput').click()">
            重新选择
        </button>
    `;
}

// 检测功能
function initializeDetection() {
    const detectBtn = document.getElementById('detectBtn');
    if (detectBtn) {
        detectBtn.addEventListener('click', performDetection);
    }
}

async function performDetection() {
    if (uploadedFiles.length === 0) {
        showNotification('请先选择文件', 'warning');
        return;
    }
    
    const modelSelect = document.getElementById('modelSelect');
    const selectedModel = modelSelect.value;
    
    showLoading(true);
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsSection = document.getElementById('resultsSection');
    
    try {
        // 模拟检测过程
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const results = uploadedFiles.map(file => ({
            filename: file.name,
            model: selectedModel,
            result: Math.random() > 0.5 ? 'fake' : 'real',
            confidence: (Math.random() * 30 + 70).toFixed(1),
            processingTime: (Math.random() * 2 + 1).toFixed(1)
        }));
        
        displayResults(results);
        resultsSection.classList.remove('hidden');
        
        // 保存到历史记录
        saveToHistory(results);
        
        showNotification('检测完成！', 'success');
    } catch (error) {
        showNotification('检测失败：' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

function displayResults(results) {
    const container = document.getElementById('resultsContainer');
    
    const resultCards = results.map(result => `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                    <i class="fas fa-file-${result.filename.includes('.') ? result.filename.split('.').pop() === 'mp4' ? 'video' : 'image' : 'alt'} text-gray-400 mr-3"></i>
                    <div>
                        <h4 class="font-medium text-gray-900">${result.filename}</h4>
                        <p class="text-sm text-gray-500">模型: ${result.model} | 处理时间: ${result.processingTime}s</p>
                    </div>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${
                    result.result === 'real' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                }">
                    ${result.result === 'real' ? '真实' : '伪造'}
                </span>
            </div>
            <div class="space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600">置信度</span>
                    <span class="text-sm font-medium text-gray-900">${result.confidence}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full" 
                         style="width: ${result.confidence}%"></div>
                </div>
            </div>
            <div class="mt-3 flex gap-2">
                <button class="text-sm text-primary-600 hover:text-primary-800 font-medium">
                    <i class="fas fa-eye mr-1"></i> 查看详情
                </button>
                <button class="text-sm text-gray-600 hover:text-gray-800 font-medium">
                    <i class="fas fa-download mr-1"></i> 下载报告
                </button>
            </div>
        </div>
    `).join('');
    
    container.innerHTML = resultCards;
}

// 历史记录功能
async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    try {
        // 模拟加载历史记录
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const history = JSON.parse(localStorage.getItem('detectionHistory') || '[]');
        
        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox text-4xl mb-2"></i>
                        <p>暂无检测记录</p>
                    </td>
                </tr>
            `;
            return;
        }
        
        const rows = history.map(record => `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.timestamp}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.filename}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${record.model}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        record.result === 'real' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                    }">
                        ${record.result === 'real' ? '真实' : '伪造'}
                    </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.confidence}%</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button class="text-primary-600 hover:text-primary-900 mr-3">查看</button>
                    <button class="text-gray-600 hover:text-gray-900">下载</button>
                </td>
            </tr>
        `).join('');
        
        tbody.innerHTML = rows;
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-red-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>加载失败</p>
                </td>
            </tr>
        `;
    }
}

function saveToHistory(results) {
    const history = JSON.parse(localStorage.getItem('detectionHistory') || '[]');
    const timestamp = new Date().toLocaleString('zh-CN');
    
    results.forEach(result => {
        history.unshift({
            ...result,
            timestamp: timestamp
        });
    });
    
    // 保留最近100条记录
    if (history.length > 100) {
        history.splice(100);
    }
    
    localStorage.setItem('detectionHistory', JSON.stringify(history));
}

// 模型管理功能
async function loadModels() {
    const grid = document.getElementById('modelsGrid');
    if (!grid) return;
    
    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const models = [
            {
                name: 'VGG',
                version: 'v2.1',
                status: 'active',
                accuracy: '94.2%',
                detections: 1234,
                description: '经典的卷积神经网络模型'
            },
            {
                name: 'LRCN',
                version: 'v1.8',
                status: 'active',
                accuracy: '91.8%',
                detections: 856,
                description: '长短期记忆卷积网络'
            },
            {
                name: 'Swin Transformer',
                version: 'v3.0',
                status: 'active',
                accuracy: '96.5%',
                detections: 2341,
                description: '最新的Transformer架构模型'
            },
            {
                name: 'Vision Transformer',
                version: 'v2.5',
                status: 'inactive',
                accuracy: '95.1%',
                detections: 567,
                description: '纯视觉Transformer模型'
            },
            {
                name: 'ResNet',
                version: 'v1.5',
                status: 'active',
                accuracy: '92.7%',
                detections: 1890,
                description: '残差网络模型'
            },
            {
                name: 'EfficientNet',
                version: 'v1.2',
                status: 'training',
                accuracy: '-',
                detections: 0,
                description: '高效网络模型（训练中）'
            }
        ];
        
        const cards = models.map(model => `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 card-hover">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center text-white font-bold">
                            ${model.name.charAt(0)}
                        </div>
                        <div class="ml-3">
                            <h3 class="font-semibold text-gray-900">${model.name}</h3>
                            <p class="text-sm text-gray-500">v${model.version}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        model.status === 'active' 
                            ? 'bg-green-100 text-green-800'
                            : model.status === 'inactive'
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                    }">
                        ${model.status === 'active' ? '活跃' : model.status === 'inactive' ? '未激活' : '训练中'}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-4">${model.description}</p>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-lg font-semibold text-gray-900">${model.accuracy}</p>
                        <p class="text-xs text-gray-500">准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-lg font-semibold text-gray-900">${model.detections}</p>
                        <p class="text-xs text-gray-500">检测次数</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
                        ${model.status === 'active' ? '使用模型' : '激活模型'}
                    </button>
                    <button class="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors">
                        详情
                    </button>
                </div>
            </div>
        `).join('');
        
        grid.innerHTML = cards;
    } catch (error) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>加载失败</p>
            </div>
        `;
    }
}

// 训练功能
function initializeTraining() {
    const form = document.getElementById('trainingForm');
    if (form) {
        form.addEventListener('submit', handleTrainingSubmit);
    }
}

async function handleTrainingSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const trainingData = Object.fromEntries(formData);
    
    showLoading(true);
    
    try {
        // 模拟创建训练任务
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        showNotification('训练任务创建成功！', 'success');
        e.target.reset();
        loadTrainingJobs();
    } catch (error) {
        showNotification('创建失败：' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadTrainingJobs() {
    const container = document.getElementById('trainingList');
    if (!container) return;
    
    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const jobs = [
            {
                id: 1,
                name: 'VGG模型优化训练',
                model: 'VGG',
                dataset: 'Celeb-DF',
                status: 'running',
                progress: 65,
                epochs: 10,
                currentEpoch: 6,
                accuracy: 92.3,
                loss: 0.234,
                startTime: '2024-01-15 14:30'
            },
            {
                id: 2,
                name: 'Swin Transformer微调',
                model: 'Swin Transformer',
                dataset: 'DFDC',
                status: 'completed',
                progress: 100,
                epochs: 20,
                currentEpoch: 20,
                accuracy: 96.8,
                loss: 0.156,
                startTime: '2024-01-14 09:15'
            },
            {
                id: 3,
                name: 'ResNet新数据集训练',
                model: 'ResNet',
                dataset: 'FaceForensics++',
                status: 'pending',
                progress: 0,
                epochs: 15,
                currentEpoch: 0,
                accuracy: 0,
                loss: 0,
                startTime: '2024-01-15 16:00'
            }
        ];
        
        const jobCards = jobs.map(job => `
            <div class="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-medium text-gray-900">${job.name}</h4>
                        <p class="text-sm text-gray-500">${job.model} • ${job.dataset}</p>
                        <p class="text-xs text-gray-400 mt-1">开始时间: ${job.startTime}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${
                        job.status === 'running' 
                            ? 'bg-blue-100 text-blue-800'
                            : job.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : job.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                    }">
                        ${job.status === 'running' ? '训练中' : job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : '等待中'}
                    </span>
                </div>
                
                ${job.status === 'running' ? `
                    <div class="mb-3">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-gray-600">进度</span>
                            <span class="font-medium">${job.progress}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-primary-600 h-2 rounded-full transition-all duration-300" style="width: ${job.progress}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">Epoch ${job.currentEpoch}/${job.epochs}</p>
                    </div>
                ` : ''}
                
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${job.accuracy}%</p>
                        <p class="text-xs text-gray-500">准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${job.loss}</p>
                        <p class="text-xs text-gray-500">损失</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${job.epochs}</p>
                        <p class="text-xs text-gray-500">总轮数</p>
                    </div>
                </div>
                
                <div class="flex gap-2 justify-end">
                    <button class="px-3 py-1 text-sm text-primary-600 hover:text-primary-800 font-medium">
                        查看详情
                    </button>
                    ${job.status === 'running' ? `
                        <button class="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium">
                            停止
                        </button>
                    ` : ''}
                    ${job.status === 'pending' ? `
                        <button class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 font-medium">
                            取消
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        container.innerHTML = jobCards;
    } catch (error) {
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>加载失败</p>
            </div>
        `;
    }
}

// 统计功能
async function loadStatistics() {
    try {
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 模拟统计数据
        const stats = {
            totalDetections: 1247,
            realCount: 756,
            fakeCount: 491,
            accuracy: 94.2
        };
        
        document.getElementById('totalDetections').textContent = stats.totalDetections.toLocaleString();
        document.getElementById('realCount').textContent = stats.realCount.toLocaleString();
        document.getElementById('fakeCount').textContent = stats.fakeCount.toLocaleString();
        document.getElementById('accuracy').textContent = stats.accuracy + '%';
        
        // 加载趋势图表
        loadTrendChart();
    } catch (error) {
        console.error('加载统计数据失败:', error);
    }
}

function loadTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    // 销毁现有图表
    if (trendChart) {
        trendChart.destroy();
    }
    
    // 生成模拟数据
    const labels = [];
    const realData = [];
    const fakeData = [];
    
    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }));
        realData.push(Math.floor(Math.random() * 30) + 10);
        fakeData.push(Math.floor(Math.random() * 20) + 5);
    }
    
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '真实内容',
                    data: realData,
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4
                },
                {
                    label: '伪造内容',
                    data: fakeData,
                    borderColor: 'rgb(239, 68, 68)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                },
                title: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// 工具函数
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.toggle('hidden', !show);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    notification.textContent = message;
    notification.className = `fixed top-4 right-4 p-4 rounded-lg text-white font-medium shadow-lg transform transition-transform z-50`;
    
    switch (type) {
        case 'success':
            notification.classList.add('bg-green-600');
            break;
        case 'error':
            notification.classList.add('bg-red-600');
            break;
        case 'warning':
            notification.classList.add('bg-yellow-600');
            break;
        default:
            notification.classList.add('bg-primary-600');
    }
    
    notification.classList.remove('translate-x-full');
    
    setTimeout(() => {
        notification.classList.add('translate-x-full');
    }, 3000);
}

// 响应式处理
window.addEventListener('resize', function() {
    if (window.innerWidth < 768 && trendChart) {
        trendChart.resize();
    }
});

// 键盘快捷键
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + 1-5 快速切换页面
    if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        const sections = ['detection', 'history', 'models', 'training', 'statistics'];
        const index = parseInt(e.key) - 1;
        if (sections[index]) {
            switchSection(sections[index]);
        }
    }
    
    // Escape 关闭加载提示
    if (e.key === 'Escape') {
        showLoading(false);
    }
});
