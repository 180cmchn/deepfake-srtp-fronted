// 全局变量
let uploadedFiles = [];
let currentSection = 'detection';
let trendChart = null;
let detectionHistoryCache = [];
let detectionModelCache = [];

const API_BASE_URL = 'http://localhost:8000/api/v1';

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
    loadDetectionModels();
    loadDetectionStats();
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
        const results = await runDetectionRequest(uploadedFiles, selectedModel);

        displayResults(results);
        resultsSection.classList.remove('hidden');

        showNotification('检测完成！', 'success');
        loadHistory();
        loadDetectionStats();
    } catch (error) {
        showNotification('检测失败：' + getApiErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
}

async function runDetectionRequest(files, selectedModel) {
    const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'wmv'];

    if (files.length === 1) {
        const file = files[0];
        const extension = file.name.split('.').pop()?.toLowerCase();
        const isVideo = file.type.startsWith('video/') || videoExtensions.includes(extension);

        if (isVideo) {
            const formData = new FormData();
            formData.append('file', file);
            if (selectedModel) {
                formData.append('model_type', selectedModel);
            }

            const response = await axios.post(`${API_BASE_URL}/detection/detect/video`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            return [normalizeVideoResult(response.data, file, selectedModel)];
        }

        const formData = new FormData();
        formData.append('file', file);
        if (selectedModel) {
            formData.append('model_type', selectedModel);
        }

        const response = await axios.post(`${API_BASE_URL}/detection/detect`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        return [normalizeDetectionResult(response.data, file, selectedModel)];
    }

    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    if (selectedModel) {
        formData.append('model_type', selectedModel);
    }

    const response = await axios.post(`${API_BASE_URL}/detection/detect/batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

    const results = response.data.results || [];
    return results.map((result, index) => normalizeDetectionResult(result, files[index], selectedModel));
}

function normalizeDetectionResult(response, file, selectedModel) {
    const fileName = file?.name || response?.file_info?.name || 'Unknown';
    const result = response?.result;

    if (!response?.success || !result) {
        return {
            filename: fileName,
            model: selectedModel,
            result: 'error',
            confidence: '-'
        };
    }

    return {
        filename: fileName,
        model: selectedModel,
        result: result.prediction,
        confidence: (result.confidence * 100).toFixed(1),
        processingTime: result.processing_time?.toFixed(2) || response.processing_time?.toFixed(2)
    };
}

function normalizeVideoResult(response, file, selectedModel) {
    const fileName = file?.name || response?.video_info?.name || 'Unknown';
    const result = response?.aggregated_result;

    if (!response?.success || !result) {
        return {
            filename: fileName,
            model: selectedModel,
            result: 'error',
            confidence: '-'
        };
    }

    return {
        filename: fileName,
        model: selectedModel,
        result: result.prediction,
        confidence: (result.confidence * 100).toFixed(1),
        processingTime: result.processing_time?.toFixed(2) || response.processing_time?.toFixed(2)
    };
}

function displayResults(results) {
    const container = document.getElementById('resultsContainer');

    const resultCards = results.map(result => {
        const isSuccess = result.result === 'real' || result.result === 'fake';
        const statusText = result.result === 'real' ? '真实' : result.result === 'fake' ? '伪造' : '失败';
        const statusClass = result.result === 'real'
            ? 'bg-green-100 text-green-800'
            : result.result === 'fake'
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-800';

        const confidenceValue = isSuccess ? `${result.confidence}%` : '-';
        const confidenceWidth = isSuccess ? `${result.confidence}%` : '0%';
        const isVideo = isVideoFile(result.filename);

        return `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                    <i class="fas fa-file-${isVideo ? 'video' : 'image'} text-gray-400 mr-3"></i>
                    <div>
                        <h4 class="font-medium text-gray-900">${result.filename}</h4>
                        <p class="text-sm text-gray-500">模型: ${result.model} | 处理时间: ${result.processingTime || '-'}s</p>
                    </div>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
            </div>
            <div class="space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600">置信度</span>
                    <span class="text-sm font-medium text-gray-900">${confidenceValue}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full" 
                         style="width: ${confidenceWidth}"></div>
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
    `;
    }).join('');

    container.innerHTML = resultCards;
}

async function loadDetectionModels() {
    const modelSelect = document.getElementById('modelSelect');
    const modelFilter = document.getElementById('modelFilter');

    try {
        const response = await axios.get(`${API_BASE_URL}/detection/models`);
        const models = response.data.models || [];
        const defaultModel = response.data.default || '';
        detectionModelCache = models;

        if (!models.length) {
            return;
        }

        if (modelSelect) {
            modelSelect.innerHTML = models.map(model => `
                <option value="${model}">${formatModelLabel(model)}${model === defaultModel ? ' (默认)' : ''}</option>
            `).join('');
            if (defaultModel) {
                modelSelect.value = defaultModel;
            }
        }

        if (modelFilter) {
            modelFilter.innerHTML = `
                <option value="">所有模型</option>
                ${models.map(model => `<option value="${model}">${formatModelLabel(model)}</option>`).join('')}
            `;
        }
    } catch (error) {
        showNotification('加载模型列表失败：' + getApiErrorMessage(error), 'error');
    }
}

async function loadDetectionStats() {
    const totalEl = document.getElementById('detectionTotal');
    const avgConfidenceEl = document.getElementById('detectionAvgConfidence');
    const avgTimeEl = document.getElementById('detectionAvgTime');
    const activeModelsEl = document.getElementById('detectionActiveModels');

    if (!totalEl || !avgConfidenceEl || !avgTimeEl || !activeModelsEl) {
        return;
    }

    try {
        const [statsResponse, modelsResponse] = await Promise.all([
            axios.get(`${API_BASE_URL}/detection/statistics`),
            axios.get(`${API_BASE_URL}/models/`, { params: { limit: 100 } })
        ]);

        const stats = statsResponse.data;
        const models = modelsResponse.data.models || [];
        const activeCount = models.filter(model => ['ready', 'deployed'].includes(model.status)).length;

        totalEl.textContent = stats.total_detections.toLocaleString();
        avgConfidenceEl.textContent = formatAccuracy(stats.average_confidence);
        const avgTimeValue = typeof stats.average_processing_time === 'number'
            ? `${stats.average_processing_time.toFixed(2)}s`
            : '-';
        avgTimeEl.textContent = avgTimeValue;
        activeModelsEl.textContent = activeCount.toString();
    } catch (error) {
        totalEl.textContent = '-';
        avgConfidenceEl.textContent = '-';
        avgTimeEl.textContent = '-';
        activeModelsEl.textContent = '-';
    }
}

function isVideoFile(filename) {
    if (!filename) return false;
    const extension = filename.split('.').pop()?.toLowerCase();
    return ['mp4', 'avi', 'mov', 'mkv', 'wmv'].includes(extension);
}

// 历史记录功能
async function loadHistory() {
    const tbody = document.getElementById('historyTableBody');
    if (!tbody) return;
    
    try {
        const historyFilter = document.getElementById('historyFilter');
        const modelFilter = document.getElementById('modelFilter');
        
        const resultFilter = historyFilter ? historyFilter.value : '';
        const modelFilterValue = modelFilter ? modelFilter.value : '';

        const response = await axios.get(`${API_BASE_URL}/detection/history`, {
            params: {
                prediction: resultFilter || undefined,
                model_type: modelFilterValue || undefined,
                limit: 100,
                order_desc: true
            }
        });

        const history = response.data.detections || [];
        detectionHistoryCache = history;
        
        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                        <i class="fas fa-inbox text-4xl mb-2"></i>
                        <p>${resultFilter || modelFilterValue ? '没有符合筛选条件的记录' : '暂无检测记录'}</p>
                    </td>
                </tr>
            `;
            return;
        }

        const rows = history.map(record => {
            const resultClass = record.prediction === 'real'
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800';
            const resultText = record.prediction === 'real' ? '真实' : '伪造';
            const confidence = formatAccuracy(record.confidence);

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatDateTime(record.created_at)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${record.file_name}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${record.model_name || '-'}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${resultClass}">
                            ${resultText}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${confidence}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button class="text-primary-600 hover:text-primary-900 mr-3" onclick="viewHistoryDetail(${record.id})">查看</button>
                        <button class="text-gray-600 hover:text-gray-900" onclick="downloadReport(${record.id})">下载</button>
                        <button class="text-red-600 hover:text-red-800 ml-3" onclick="deleteHistoryRecord(${record.id})">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = rows;
        
        // 显示筛选结果提示
        if (resultFilter || modelFilterValue) {
            const filterText = [];
            if (resultFilter) {
                filterText.push(`结果: ${resultFilter === 'real' ? '真实' : '伪造'}`);
            }
            if (modelFilterValue) {
                filterText.push(`模型: ${modelFilterValue}`);
            }
            showNotification(`已应用筛选条件: ${filterText.join(', ')}，找到 ${history.length} 条记录`, 'info');
        }
        
    } catch (error) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-6 py-12 text-center text-red-500">
                    <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                    <p>加载失败</p>
                </td>
            </tr>
        `;
        showNotification('加载历史记录失败：' + getApiErrorMessage(error), 'error');
    }
}

// 模型管理功能
async function loadModels() {
    const grid = document.getElementById('modelsGrid');
    if (!grid) return;
    
    try {
        const response = await axios.get(`${API_BASE_URL}/models/`, {
            params: { limit: 100 }
        });

        const models = response.data.models || [];

        if (models.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full text-center py-12 text-gray-500">
                    <i class="fas fa-inbox text-2xl mb-2"></i>
                    <p>暂无模型</p>
                </div>
            `;
            return;
        }

        const cards = models.map(model => {
            const statusLabel = mapModelStatus(model.status);
            const statusClass = mapModelStatusClass(model.status);
            const accuracy = formatAccuracy(model.metrics?.accuracy);

            return `
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
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">
                        ${statusLabel}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-4">${model.description || '暂无描述'}</p>
                <div class="grid grid-cols-2 gap-4 mb-4">
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-lg font-semibold text-gray-900">${accuracy}</p>
                        <p class="text-xs text-gray-500">准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-lg font-semibold text-gray-900">${model.input_size || '-'}</p>
                        <p class="text-xs text-gray-500">输入尺寸</p>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button class="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors">
                        ${model.is_default ? '默认模型' : '查看详情'}
                    </button>
                    <button class="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors">
                        详情
                    </button>
                </div>
            </div>
        `;
        }).join('');

        grid.innerHTML = cards;
    } catch (error) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>加载失败</p>
            </div>
        `;
        showNotification('加载模型失败：' + getApiErrorMessage(error), 'error');
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
        const modelType = trainingData.model_type;
        const datasetPath = trainingData.dataset_path;
        const epochs = parseInt(trainingData.epochs, 10);
        const batchSize = parseInt(trainingData.batch_size, 10);
        const learningRate = parseFloat(trainingData.learning_rate);

        const payload = {
            name: `${modelType.toUpperCase()} 训练任务 ${new Date().toLocaleString('zh-CN')}`,
            description: trainingData.description || null,
            model_type: modelType,
            dataset_path: datasetPath,
            parameters: {
                epochs: epochs,
                learning_rate: learningRate,
                batch_size: batchSize
            }
        };

        await axios.post(`${API_BASE_URL}/training/jobs`, payload, {
            params: { auto_start: true }
        });

        showNotification('训练任务创建成功！', 'success');
        e.target.reset();
        loadTrainingJobs();
    } catch (error) {
        showNotification('创建失败：' + getApiErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
}

async function loadTrainingJobs() {
    const container = document.getElementById('trainingList');
    if (!container) return;
    
    try {
        const statusFilter = document.getElementById('trainingStatusFilter');
        const statusValue = statusFilter ? statusFilter.value : '';

        const response = await axios.get(`${API_BASE_URL}/training/jobs`, {
            params: {
                status: statusValue || undefined,
                limit: 50,
                order_desc: true
            }
        });

        const jobs = response.data.jobs || [];

        if (jobs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-inbox text-2xl mb-2"></i>
                    <p>暂无训练任务</p>
                </div>
            `;
            return;
        }

        const jobCards = jobs.map(job => {
            const progress = typeof job.progress === 'number' ? job.progress : 0;
            const epochs = job.parameters?.epochs ?? '-';
            const totalEpochs = typeof epochs === 'number' ? epochs : null;
            const currentEpoch = totalEpochs
                ? Math.max(1, Math.round((progress / 100) * totalEpochs))
                : '-';
            const accuracy = formatAccuracy(job.results?.accuracy);
            const loss = formatLoss(job.results?.loss);
            const startedAt = formatDateTime(job.started_at || job.created_at);
            const modelLabel = formatModelLabel(job.model_type);
            const modelPath = job.results?.model_path;
            const modelFileStatus = modelPath ? '已生成' : '未生成';

            return `
            <div class="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-medium text-gray-900">${job.name}</h4>
                        <p class="text-sm text-gray-500">${modelLabel} • ${job.dataset_path}</p>
                        <p class="text-xs text-gray-400 mt-1">开始时间: ${startedAt}</p>
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
                        ${job.status === 'running' ? '训练中' : job.status === 'completed' ? '已完成' : job.status === 'failed' ? '失败' : job.status === 'cancelled' ? '已取消' : '等待中'}
                    </span>
                </div>
                
                ${job.status === 'running' ? `
                    <div class="mb-3">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-gray-600">进度</span>
                            <span class="font-medium">${progress.toFixed(1)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-primary-600 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">Epoch ${job.progress === 100 ? epochs : currentEpoch}/${epochs}</p>
                    </div>
                ` : ''}
                
                <div class="grid grid-cols-3 gap-2 mb-3">
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${accuracy}</p>
                        <p class="text-xs text-gray-500">准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${loss}</p>
                        <p class="text-xs text-gray-500">损失</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${epochs}</p>
                        <p class="text-xs text-gray-500">总轮数</p>
                    </div>
                </div>

                <p class="text-xs text-gray-500 mb-3">模型文件: ${modelFileStatus}（由人工决定是否保留）</p>
                
                <div class="flex gap-2 justify-end">
                    <button class="px-3 py-1 text-sm text-primary-600 hover:text-primary-800 font-medium" onclick="viewTrainingJob(${job.id})">
                        查看详情
                    </button>
                    ${job.status === 'completed' && modelPath ? `
                        <button class="px-3 py-1 text-sm text-green-600 hover:text-green-800 font-medium" onclick="retainTrainingModel(${job.id})">
                            保留模型
                        </button>
                        <button class="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium" onclick="discardTrainingModel(${job.id})">
                            删除模型
                        </button>
                    ` : ''}
                    ${job.status === 'pending' ? `
                        <button class="px-3 py-1 text-sm text-green-600 hover:text-green-800 font-medium" onclick="startTrainingJob(${job.id})">
                            开始
                        </button>
                        <button class="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 font-medium" onclick="stopTrainingJob(${job.id})">
                            取消
                        </button>
                    ` : ''}
                    ${job.status === 'running' ? `
                        <button class="px-3 py-1 text-sm text-red-600 hover:text-red-800 font-medium" onclick="stopTrainingJob(${job.id})">
                            停止
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
        }).join('');

        container.innerHTML = jobCards;
    } catch (error) {
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>加载失败</p>
            </div>
        `;
        showNotification('加载训练任务失败：' + getApiErrorMessage(error), 'error');
    }
}

async function startTrainingJob(jobId) {
    try {
        await axios.post(`${API_BASE_URL}/training/jobs/${jobId}/start`);
        showNotification('训练任务已开始', 'success');
        loadTrainingJobs();
    } catch (error) {
        showNotification('启动失败：' + getApiErrorMessage(error), 'error');
    }
}

async function stopTrainingJob(jobId) {
    try {
        await axios.post(`${API_BASE_URL}/training/jobs/${jobId}/stop`);
        showNotification('训练任务已停止', 'success');
        loadTrainingJobs();
    } catch (error) {
        showNotification('停止失败：' + getApiErrorMessage(error), 'error');
    }
}

async function viewTrainingJob(jobId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/training/jobs/${jobId}`);
        const job = response.data;
        const progress = typeof job.progress === 'number' ? job.progress.toFixed(1) + '%' : '-';
        const modelPath = job.results?.model_path || '-';
        const detail = `训练任务: ${job.name}\n模型: ${formatModelLabel(job.model_type)}\n数据集: ${job.dataset_path}\n状态: ${job.status}\n进度: ${progress}\n模型文件: ${modelPath}\n提示: 模型是否保留由人工决定`;
        showNotification(detail, 'info');
    } catch (error) {
        showNotification('获取详情失败：' + getApiErrorMessage(error), 'error');
    }
}

async function retainTrainingModel(jobId) {
    try {
        await axios.post(`${API_BASE_URL}/training/jobs/${jobId}/model/retain`);
        showNotification('已确认保留模型文件', 'success');
        loadTrainingJobs();
    } catch (error) {
        showNotification('保留模型失败：' + getApiErrorMessage(error), 'error');
    }
}

async function discardTrainingModel(jobId) {
    const confirmed = window.confirm('确定要删除该训练任务生成的模型文件吗？该操作不可恢复。');
    if (!confirmed) {
        return;
    }

    try {
        await axios.delete(`${API_BASE_URL}/training/jobs/${jobId}/model`);
        showNotification('模型文件已删除', 'success');
        loadTrainingJobs();
    } catch (error) {
        showNotification('删除模型失败：' + getApiErrorMessage(error), 'error');
    }
}

function formatAccuracy(value) {
    if (value === null || value === undefined) return '-';
    const normalized = value <= 1 ? value * 100 : value;
    return `${normalized.toFixed(1)}%`;
}

function formatLoss(value) {
    if (value === null || value === undefined) return '-';
    return value.toFixed(4);
}

function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString('zh-CN');
}

function formatModelLabel(value) {
    if (!value) return '-';
    const mapping = {
        vgg: 'VGG',
        lrcn: 'LRCN',
        swin: 'Swin Transformer',
        vit: 'Vision Transformer',
        resnet: 'ResNet'
    };
    return mapping[value] || value.toUpperCase();
}

function mapModelStatus(status) {
    const mapping = {
        training: '训练中',
        ready: '可用',
        deployed: '已部署',
        archived: '已归档',
        failed: '失败'
    };
    return mapping[status] || status;
}

function mapModelStatusClass(status) {
    if (status === 'ready' || status === 'deployed') {
        return 'bg-green-100 text-green-800';
    }
    if (status === 'training') {
        return 'bg-yellow-100 text-yellow-800';
    }
    if (status === 'failed') {
        return 'bg-red-100 text-red-800';
    }
    return 'bg-gray-100 text-gray-800';
}

// 统计功能
async function loadStatistics() {
    try {
        const response = await axios.get(`${API_BASE_URL}/detection/statistics`);
        const stats = response.data;

        document.getElementById('totalDetections').textContent = stats.total_detections.toLocaleString();
        document.getElementById('realCount').textContent = stats.real_detections.toLocaleString();
        document.getElementById('fakeCount').textContent = stats.fake_detections.toLocaleString();
        document.getElementById('accuracy').textContent = formatAccuracy(stats.average_confidence);

        loadTrendChart(stats.daily_detections || {});
    } catch (error) {
        showNotification('加载统计数据失败：' + getApiErrorMessage(error), 'error');
    }
}

function loadTrendChart(dailyDetections) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;
    
    // 销毁现有图表
    if (trendChart) {
        trendChart.destroy();
    }

    const labels = Object.keys(dailyDetections || {}).sort();
    const totals = labels.map(label => dailyDetections[label]);

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '检测次数',
                    data: totals,
                    borderColor: 'rgb(37, 99, 235)',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
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

function getApiErrorMessage(error) {
    if (error?.response?.data?.detail) {
        return error.response.data.detail;
    }
    if (error?.message) {
        return error.message;
    }
    return '未知错误';
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

// 查看历史记录详情
function viewHistoryDetail(index) {
    const record = getHistoryRecordById(index);
    
    if (!record) {
        showNotification('记录不存在', 'error');
        return;
    }
    
    // 创建详情模态框
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4">
                <h2 class="text-xl font-semibold text-gray-900">检测详情</h2>
                <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">文件名</label>
                        <p class="text-sm text-gray-900">${record.file_name}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测时间</label>
                        <p class="text-sm text-gray-900">${formatDateTime(record.created_at)}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">使用模型</label>
                        <p class="text-sm text-gray-900">${record.model_name || '-'}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测结果</label>
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            record.prediction === 'real' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                        }">
                            ${record.prediction === 'real' ? '真实' : '伪造'}
                        </span>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">置信度</label>
                    <div class="flex items-center space-x-3">
                        <div class="flex-1 bg-gray-200 rounded-full h-2">
                            <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full" 
                                 style="width: ${(record.confidence * 100).toFixed(1)}%"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-900">${formatAccuracy(record.confidence)}</span>
                    </div>
                </div>
                
                ${record.processing_time ? `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">处理时间</label>
                    <p class="text-sm text-gray-900">${record.processing_time.toFixed(2)} 秒</p>
                </div>
                ` : ''}
                
                <div class="bg-gray-50 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-gray-900 mb-2">检测分析</h3>
                    <p class="text-sm text-gray-600">
                        ${record.prediction === 'real' 
                            ? '经过深度学习模型分析，该文件被判定为真实内容，未发现明显的深度伪造痕迹。'
                            : '经过深度学习模型分析，该文件被判定为可能包含深度伪造内容，建议进一步验证。'}
                    </p>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-blue-900 mb-2">
                        <i class="fas fa-info-circle mr-2"></i>技术说明
                    </h3>
                    <p class="text-sm text-blue-800">
                        本检测结果基于 ${record.model_name || '未知模型'} 模型进行分析，该模型在多个公开数据集上进行了训练，
                        具有较高的准确率。置信度表示模型对判断结果的确定程度。
                    </p>
                </div>
            </div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="downloadReport(${index})" class="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                    <i class="fas fa-download mr-2"></i> 下载报告
                </button>
                <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
                    关闭
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 点击背景关闭模态框
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 下载报告
function downloadReport(index) {
    const record = getHistoryRecordById(index);
    
    if (!record) {
        showNotification('记录不存在', 'error');
        return;
    }
    
    // 生成报告内容
    const reportContent = `
Deepfake 检测报告

检测信息:
    - 文件名: ${record.file_name}
    - 检测时间: ${formatDateTime(record.created_at)}
    - 使用模型: ${record.model_name || '-'}

检测结果:
    - 判定结果: ${record.prediction === 'real' ? '真实' : '伪造'}
    - 置信度: ${formatAccuracy(record.confidence)}
    ${record.processing_time ? `- 处理时间: ${record.processing_time.toFixed(2)} 秒` : ''}

分析说明:
    ${record.prediction === 'real' 
        ? '经过深度学习模型分析，该文件被判定为真实内容，未发现明显的深度伪造痕迹。'
        : '经过深度学习模型分析，该文件被判定为可能包含深度伪造内容，建议进一步验证。'}

技术说明:
    本检测结果基于 ${record.model_name || '未知模型'} 模型进行分析，该模型在多个公开数据集上进行了训练，
    具有较高的准确率。置信度表示模型对判断结果的确定程度。

生成时间: ${new Date().toLocaleString('zh-CN')}
生成平台: Deepfake 检测平台 v1.0.0
`;
    
    // 创建下载链接
    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepfake_report_${record.file_name.replace(/\.[^/.]+$/, '')}_${new Date().getTime()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showNotification('报告下载成功', 'success');
}

async function deleteHistoryRecord(recordId) {
    try {
        await axios.delete(`${API_BASE_URL}/detection/history/${recordId}`);
        showNotification('记录已删除', 'success');
        loadHistory();
        loadDetectionStats();
        loadStatistics();
    } catch (error) {
        showNotification('删除失败：' + getApiErrorMessage(error), 'error');
    }
}

function getHistoryRecordById(recordId) {
    return detectionHistoryCache.find(item => item.id === recordId);
}

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
        // 关闭所有模态框
        const modals = document.querySelectorAll('.fixed.inset-0');
        modals.forEach(modal => modal.remove());
    }
});
