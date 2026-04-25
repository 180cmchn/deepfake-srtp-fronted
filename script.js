// 全局变量
let uploadedFiles = [];
let currentSection = 'detection';
let trendChart = null;
let trainingEpochChart = null;
let trainingDetailModal = null;
let trainingDetailJobId = null;
let modelDetailModal = null;
let trainingChartMetricVisibility = {
    trainAccuracy: true,
    videoValAccuracy: true,
    sampleValAccuracy: false,
    trainLoss: true,
    videoValLoss: true,
    sampleValLoss: false
};
let detectionHistoryCache = [];
let detectionResultCache = [];
let detectionModelCache = [];
let detectionModelTypeCache = [];
let trainingDatasetCache = [];
let trainingJobsPollTimer = null;
let selectedTrainingDatasetFiles = [];
let selectedTrainingDatasetRelativePaths = [];
let currentDatasetRegisterMode = 'path';

function normalizeApiPrefix(value) {
    if (typeof value !== 'string' || !value.trim()) return '/api/v1';
    const trimmed = value.trim();
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function resolveApiBaseUrl() {
    const config = window.__APP_CONFIG__ || {};
    if (typeof config.API_BASE_URL === 'string' && config.API_BASE_URL.trim()) {
        return config.API_BASE_URL.replace(/\/+$/, '');
    }

    const scheme = config.API_SCHEME || (window.location.protocol === 'file:' ? 'http:' : window.location.protocol || 'http:');
    const host = config.API_HOST || window.location.hostname || 'localhost';
    const port = String(config.API_PORT || '8000').trim();
    const prefix = normalizeApiPrefix(config.API_V1_STR || config.API_V1_PREFIX);
    return `${scheme}//${host}:${port}${prefix}`;
}

const API_BASE_URL = resolveApiBaseUrl();
const TRAINING_JOBS_POLL_INTERVAL = 1000;

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
    loadTrainingDatasets();
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
    handleSectionChange(sectionName);
}

function handleSectionChange(sectionName) {
    if (sectionName === 'training') {
        loadTrainingDatasets();
        loadTrainingJobs({ silent: true });
        startTrainingJobsPolling();
        return;
    }

    stopTrainingJobsPolling();
}

// 文件上传功能
function initializeFileUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const detectBtn = document.getElementById('detectBtn');
    
    if (!uploadArea || !fileInput) return;
    
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
        const extension = file.name.split('.').pop()?.toLowerCase();
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'video/mp4', 'video/avi', 'video/mov', 'video/x-matroska', 'video/quicktime'];
        const validExtensions = ['jpg', 'jpeg', 'png', 'bmp', 'tiff', 'mp4', 'avi', 'mov', 'mkv', 'wmv'];
        const maxSize = 100 * 1024 * 1024; // 100MB
        
        if (!(validTypes.includes(file.type) || validExtensions.includes(extension))) {
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
                <span class="text-sm text-gray-700">${escapeHtml(file.name)}</span>
            </div>
            <span class="text-xs text-gray-500">${escapeHtml((file.size / 1024 / 1024).toFixed(2))} MB</span>
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
    const selectedModel = parseDetectionModelSelection(modelSelect.value);

    if (selectedModel.usableFor.length && !canUseModelForFiles(selectedModel, uploadedFiles)) {
        showNotification(`当前模型仅支持${selectedModel.usableFor.includes('video') && !selectedModel.usableFor.includes('image') ? '视频' : '所选文件类型'}检测`, 'warning');
        return;
    }
    
    showLoading(true);
    const resultsContainer = document.getElementById('resultsContainer');
    const resultsSection = document.getElementById('resultsSection');
    
    try {
        const results = await runDetectionRequest(uploadedFiles, selectedModel);
        detectionResultCache = results;

        displayResults(results);
        resultsSection.classList.remove('hidden');

        showNotification('检测完成！', 'success');
        loadHistory();
        loadDetectionStats();
    } catch (error) {
        showNotification('检测失败：' + getApiErrorMessage(error), 'error');
        await Promise.allSettled([
            loadHistory(),
            loadDetectionStats(),
            loadStatistics()
        ]);
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
            appendDetectionModelSelection(formData, selectedModel);
            appendDetectionRequestOptions(formData);

            const response = await axios.post(`${API_BASE_URL}/detection/detect`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            return [normalizeDetectionResult(response.data, file, selectedModel, 0)];
        }

        const formData = new FormData();
        formData.append('file', file);
        appendDetectionModelSelection(formData, selectedModel);
        appendDetectionRequestOptions(formData);

        const response = await axios.post(`${API_BASE_URL}/detection/detect`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        return [normalizeDetectionResult(response.data, file, selectedModel, 0)];
    }

    const formData = new FormData();
    files.forEach(file => {
        formData.append('files', file);
    });
    appendDetectionModelSelection(formData, selectedModel);
    appendDetectionRequestOptions(formData);

    const response = await axios.post(`${API_BASE_URL}/detection/detect/batch`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });

    const results = response.data.results || [];
    return results.map((result, index) => normalizeDetectionResult(result, files[index], selectedModel, index));
}

function normalizeDetectionResult(response, file, selectedModel, index = 0) {
    const fileName = file?.name || response?.file_info?.name || 'Unknown';
    const result = response?.result;
    const modelInfo = result?.model_info || null;
    const modelLabel = formatDetectionResultModelLabel(modelInfo, selectedModel);
    const recordId = response?.record_id || response?.file_info?.record_id || null;
    const videoMetadata = extractVideoMetadata(response?.file_info || null);

    if (!response?.success || !result) {
        return {
            id: recordId || `result-${index}`,
            filename: fileName,
            model: modelLabel,
            result: 'error',
            confidence: '-',
            processingTime: response?.processing_time?.toFixed?.(2) || '-',
            errorMessage: response?.error_message || '检测失败',
            createdAt: response?.created_at || null,
            type: response?.file_info?.type || (isVideoFile(fileName) ? 'video' : 'image'),
            totalFrames: videoMetadata.sampledFrameCount,
            processedFrames: videoMetadata.analyzedFrameCount,
            duration: videoMetadata.sampledDurationSeconds,
            sourceTotalFrames: videoMetadata.sourceTotalFrames,
            sourceDurationSeconds: videoMetadata.sourceDurationSeconds,
            sourceFps: videoMetadata.sourceFps,
            sampledFrameCount: videoMetadata.sampledFrameCount,
            analyzedFrameCount: videoMetadata.analyzedFrameCount,
            sampledDurationSeconds: videoMetadata.sampledDurationSeconds,
        };
    }

    return {
        id: recordId || `result-${index}`,
        filename: fileName,
        model: modelLabel,
        result: result.prediction,
        confidence: (result.confidence * 100).toFixed(1),
        processingTime: result.processing_time?.toFixed(2) || response.processing_time?.toFixed(2),
        rawConfidence: result.confidence,
        probabilities: result.probabilities || null,
        decisionMetrics: result.decision_metrics || null,
        processingTimeSeconds: result.processing_time || response.processing_time || null,
        createdAt: response?.created_at || null,
        type: response?.file_info?.type || (isVideoFile(fileName) ? 'video' : 'image'),
        totalFrames: videoMetadata.sampledFrameCount,
        processedFrames: videoMetadata.analyzedFrameCount,
        duration: videoMetadata.sampledDurationSeconds,
        sourceTotalFrames: videoMetadata.sourceTotalFrames,
        sourceDurationSeconds: videoMetadata.sourceDurationSeconds,
        sourceFps: videoMetadata.sourceFps,
        sampledFrameCount: videoMetadata.sampledFrameCount,
        analyzedFrameCount: videoMetadata.analyzedFrameCount,
        sampledDurationSeconds: videoMetadata.sampledDurationSeconds,
        modelInfo: modelInfo,
        errorMessage: response?.error_message || null,
    };
}

function getPreferredMetadataValue(...values) {
    for (const value of values) {
        if (value === undefined || value === null || value === '') continue;
        if (typeof value === 'number' && Number.isNaN(value)) continue;
        return value;
    }
    return null;
}

function extractVideoMetadata(source) {
    return {
        sourceTotalFrames: getPreferredMetadataValue(source?.sourceTotalFrames, source?.source_total_frames),
        sourceDurationSeconds: getPreferredMetadataValue(source?.sourceDurationSeconds, source?.source_duration_seconds),
        sourceFps: getPreferredMetadataValue(source?.sourceFps, source?.source_fps),
        sampledFrameCount: getPreferredMetadataValue(source?.sampledFrameCount, source?.sampled_frame_count, source?.totalFrames, source?.total_frames),
        analyzedFrameCount: getPreferredMetadataValue(source?.analyzedFrameCount, source?.analyzed_frame_count, source?.processedFrames, source?.processed_frames),
        sampledDurationSeconds: getPreferredMetadataValue(source?.sampledDurationSeconds, source?.sampled_duration_seconds, source?.duration, source?.duration_seconds),
    };
}

function formatVideoMetadataValue(value, unit = '') {
    const resolvedValue = getPreferredMetadataValue(value);
    if (resolvedValue === null) {
        return '-';
    }

    let formattedValue = String(resolvedValue);
    if (typeof resolvedValue === 'number') {
        const fractionDigits = unit === 'FPS' ? 3 : 2;
        formattedValue = Number.isInteger(resolvedValue)
            ? String(resolvedValue)
            : resolvedValue.toFixed(fractionDigits).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
    }

    return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function buildVideoMetadataItems(source) {
    const metadata = extractVideoMetadata(source);
    const items = [];

    if (metadata.sourceTotalFrames !== null) {
        items.push({ label: '源视频总帧数', value: formatVideoMetadataValue(metadata.sourceTotalFrames) });
    }
    if (metadata.sourceDurationSeconds !== null) {
        items.push({ label: '源视频时长', value: formatVideoMetadataValue(metadata.sourceDurationSeconds, '秒') });
    }
    if (metadata.sourceFps !== null) {
        items.push({ label: '源视频帧率', value: formatVideoMetadataValue(metadata.sourceFps, 'FPS') });
    }
    if (metadata.sampledFrameCount !== null) {
        items.push({ label: '采样帧数', value: formatVideoMetadataValue(metadata.sampledFrameCount) });
    }
    if (metadata.analyzedFrameCount !== null) {
        items.push({ label: '分析帧数', value: formatVideoMetadataValue(metadata.analyzedFrameCount) });
    }
    if (metadata.sampledDurationSeconds !== null) {
        items.push({ label: '采样时长', value: formatVideoMetadataValue(metadata.sampledDurationSeconds, '秒') });
    }

    return items;
}

function formatDetectionResultModelLabel(modelInfo, selectedModel) {
    if (modelInfo?.model_name) {
        if (modelInfo.model_id) {
            const modelTypeLabel = modelInfo.model_type ? formatModelLabel(modelInfo.model_type) : null;
            return modelTypeLabel ? `${modelInfo.model_name} (${modelTypeLabel})` : modelInfo.model_name;
        }
        return modelInfo.model_type ? formatModelLabel(modelInfo.model_type) : modelInfo.model_name;
    }
    return selectedModel?.label || '-';
}

function displayResults(results) {
    const container = document.getElementById('resultsContainer');

    const resultCards = results.map((result, index) => {
        const isSuccess = result.result === 'real' || result.result === 'fake';
        const statusText = result.result === 'real' ? '真实' : result.result === 'fake' ? '伪造' : '失败';
        const statusClass = result.result === 'real'
            ? 'bg-green-100 text-green-800'
            : result.result === 'fake'
            ? 'bg-red-100 text-red-800'
            : 'bg-gray-100 text-gray-800';

        const confidenceValue = isSuccess ? `${result.confidence}%` : '-';
        const confidenceWidth = isSuccess ? formatInlineWidthPercent(result.confidence) : '0%';
        const isVideo = isVideoFile(result.filename);
        const predictedConfidenceLabel = getPredictedConfidenceLabel();
        const fakeThresholdLabel = getDecisionThresholdLabel(result.decisionMetrics);
        const decisionSummary = isSuccess && result.decisionMetrics ? `
            <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div class="rounded bg-white px-3 py-2 border border-gray-200">
                    <p class="text-gray-500">Fake 概率</p>
                    <p class="mt-1 font-semibold text-gray-900">${escapeHtml(formatPercentFromProbability(result.decisionMetrics.fake_probability))}</p>
                </div>
                <div class="rounded bg-white px-3 py-2 border border-gray-200">
                    <p class="text-gray-500">${escapeHtml(fakeThresholdLabel)}</p>
                    <p class="mt-1 font-semibold text-gray-900">${escapeHtml(formatPercentFromProbability(result.decisionMetrics.confidence_threshold))}</p>
                </div>
            </div>
        ` : '';

        return `
        <div class="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center">
                    <i class="fas fa-file-${isVideo ? 'video' : 'image'} text-gray-400 mr-3"></i>
                    <div>
                        <h4 class="font-medium text-gray-900">${escapeHtml(result.filename)}</h4>
                        <p class="text-sm text-gray-500">模型: ${escapeHtml(result.model)} | 处理时间: ${escapeHtml(result.processingTime || '-')}s</p>
                    </div>
                </div>
                <span class="px-3 py-1 rounded-full text-xs font-medium ${statusClass}">
                    ${statusText}
                </span>
            </div>
            <div class="space-y-2">
                <div class="flex justify-between items-center">
                    <span class="text-sm text-gray-600">${escapeHtml(predictedConfidenceLabel)}</span>
                    <span class="text-sm font-medium text-gray-900">${escapeHtml(confidenceValue)}</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full" 
                         style="width: ${confidenceWidth}"></div>
                </div>
            </div>
            ${decisionSummary}
            <div class="mt-3 flex gap-2">
                <button class="text-sm text-primary-600 hover:text-primary-800 font-medium" onclick="viewDetectionResultDetail(${index})">
                    <i class="fas fa-eye mr-1"></i> 查看详情
                </button>
                <button class="text-sm text-gray-600 hover:text-gray-800 font-medium" onclick="downloadDetectionResultReport(${index})">
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
    const trainingModelTypeSelect = document.getElementById('trainingModelType');

    try {
        const response = await axios.get(`${API_BASE_URL}/detection/models`);
        const models = response.data.models || [];
        const defaultModel = response.data.default || {};
        detectionModelTypeCache = response.data.model_types || [];
        detectionModelCache = models;

        if (trainingModelTypeSelect) {
            populateTrainingModelTypeOptions(trainingModelTypeSelect, detectionModelTypeCache);
        }

        if (!models.length) {
            return;
        }

        if (modelSelect) {
            const optionMarkup = models.map(model => `
                <option value="${escapeHtml(serializeDetectionModel(model))}">${escapeHtml(`${model.label}${model.is_default ? ' (默认)' : ''}`)}</option>
            `).join('');
            const defaultValue = defaultModel.model_id
                ? `id:${defaultModel.model_id}`
                : `type:${defaultModel.model_type || ''}`;
            const hasReadyDefault = Boolean(defaultModel.is_ready && defaultValue !== 'type:');
            modelSelect.innerHTML = hasReadyDefault
                ? optionMarkup
                : `<option value="" selected>请选择可用模型</option>${optionMarkup}`;
            if (hasReadyDefault) {
                modelSelect.value = defaultValue;
            }
        }

        if (modelFilter) {
            const filterTypes = detectionModelTypeCache.length
                ? detectionModelTypeCache
                : Array.from(new Set(models.map(model => model.model_type).filter(Boolean)));
            modelFilter.innerHTML = `
                <option value="">所有模型</option>
                ${filterTypes.map(modelType => `<option value="${escapeHtml(modelType)}">${escapeHtml(formatModelLabel(modelType))}</option>`).join('')}
            `;
        }
    } catch (error) {
        showNotification('加载模型列表失败：' + getApiErrorMessage(error), 'error');
    }
}

function populateTrainingModelTypeOptions(select, modelTypes) {
    if (!select) return;

    const previousValue = select.value;
    const availableModelTypes = Array.isArray(modelTypes)
        ? modelTypes.filter(Boolean)
        : [];

    select.innerHTML = `
        <option value="">选择模型类型</option>
        ${availableModelTypes.map(modelType => `<option value="${escapeHtml(modelType)}">${escapeHtml(formatModelLabel(modelType))}</option>`).join('')}
    `;
    select.value = availableModelTypes.includes(previousValue) ? previousValue : '';
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
            axios.get(`${API_BASE_URL}/detection/models`)
        ]);

        const stats = statsResponse.data;
        const models = modelsResponse.data.models || [];
        const activeCount = models.length;

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

function sanitizeReportFilename(value, fallback = 'report') {
    const sanitized = String(value || fallback)
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return sanitized || fallback;
}

function buildReportDataFromCurrentResult(record) {
    if (!record) return null;
    const videoMetadata = extractVideoMetadata(record);
    return {
        title: 'Deepfake 检测报告',
        fileName: record.filename,
        fileType: record.type === 'video' ? '视频' : '图片',
        detectedAt: formatDateTime(record.createdAt),
        modelName: record.model || '-',
        predictionText: record.result === 'real' ? '真实' : record.result === 'fake' ? '伪造' : '失败',
        predictionClass: record.result === 'real' ? 'real' : record.result === 'fake' ? 'fake' : 'error',
        confidenceLabel: getPredictedConfidenceLabel(),
        confidenceText: record.result === 'error' ? '-' : `${record.confidence}%`,
        confidenceValue: typeof record.rawConfidence === 'number' ? record.rawConfidence : null,
        processingTimeText: record.processingTime ? `${record.processingTime} 秒` : '-',
        sourceTotalFrames: videoMetadata.sourceTotalFrames,
        sourceDurationSeconds: videoMetadata.sourceDurationSeconds,
        sourceFps: videoMetadata.sourceFps,
        sampledFrameCount: videoMetadata.sampledFrameCount,
        analyzedFrameCount: videoMetadata.analyzedFrameCount,
        sampledDurationSeconds: videoMetadata.sampledDurationSeconds,
        videoMetadataItems: buildVideoMetadataItems(videoMetadata),
        errorMessage: record.errorMessage || '',
        probabilities: record.probabilities || null,
        decisionMetrics: record.decisionMetrics || null,
        generatedAt: new Date().toLocaleString('zh-CN'),
    };
}

function buildReportDataFromHistoryRecord(record) {
    if (!record) return null;
    const historyModelLabel = formatHistoryModelLabel(record);
    const historyOutcome = getHistoryOutcome(record);
    const videoMetadata = extractVideoMetadata(record);
    return {
        title: 'Deepfake 检测历史报告',
        fileName: record.file_name,
        fileType: record.file_type === 'video' ? '视频' : '图片',
        detectedAt: formatDateTime(record.created_at),
        modelName: historyModelLabel,
        predictionText: historyOutcome.text,
        predictionClass: historyOutcome.className,
        confidenceLabel: getPredictedConfidenceLabel(),
        confidenceText: historyOutcome.isFailed ? '-' : formatAccuracy(record.confidence),
        confidenceValue: historyOutcome.isFailed
            ? null
            : (typeof record.confidence === 'number' ? record.confidence : null),
        processingTimeText: typeof record.processing_time === 'number' ? `${record.processing_time.toFixed(2)} 秒` : '-',
        sourceTotalFrames: videoMetadata.sourceTotalFrames,
        sourceDurationSeconds: videoMetadata.sourceDurationSeconds,
        sourceFps: videoMetadata.sourceFps,
        sampledFrameCount: videoMetadata.sampledFrameCount,
        analyzedFrameCount: videoMetadata.analyzedFrameCount,
        sampledDurationSeconds: videoMetadata.sampledDurationSeconds,
        videoMetadataItems: buildVideoMetadataItems(videoMetadata),
        errorMessage: record.error_message || '',
        probabilities: null,
        decisionMetrics: null,
        generatedAt: new Date().toLocaleString('zh-CN'),
    };
}

function renderDetectionReportHtml(report) {
    const videoMetadataItems = Array.isArray(report.videoMetadataItems)
        ? report.videoMetadataItems
        : buildVideoMetadataItems(report);
    const predictionBadgeClass = report.predictionClass === 'real'
        ? '#166534'
        : report.predictionClass === 'fake'
        ? '#991b1b'
        : '#92400e';
    const predictionBadgeBg = report.predictionClass === 'real'
        ? '#dcfce7'
        : report.predictionClass === 'fake'
        ? '#fee2e2'
        : '#fef3c7';
    const confidencePercent = typeof report.confidenceValue === 'number'
        ? `${Math.max(0, Math.min(100, report.confidenceValue * 100)).toFixed(1)}%`
        : '0%';
    const probabilityRows = report.probabilities
        ? Object.entries(report.probabilities).map(([label, value]) => `
            <tr>
                <td>${escapeHtml(label)}</td>
                <td>${escapeHtml(formatAccuracy(value))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="2">未返回类别概率</td></tr>';
    const decisionMetricRows = renderDecisionMetricTableRows(report.decisionMetrics);
    const mediaAnalysisItems = [
        ...videoMetadataItems.map(item => `<div class="item"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`),
        `<div class="item"><div class="label">生成时间</div><div class="value">${escapeHtml(report.generatedAt)}</div></div>`
    ].join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(report.title)}</title>
  <style>
    body { font-family: "PingFang SC", "Microsoft YaHei", sans-serif; background: #f3f4f6; color: #111827; margin: 0; padding: 32px; }
    .sheet { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 20px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); overflow: hidden; }
    .hero { padding: 28px 32px; background: linear-gradient(135deg, #0f172a, #1d4ed8); color: #fff; }
    .hero h1 { margin: 0 0 8px; font-size: 28px; }
    .hero p { margin: 0; opacity: 0.85; }
    .section { padding: 24px 32px; border-top: 1px solid #e5e7eb; }
    .section h2 { margin: 0 0 16px; font-size: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 20px; }
    .item { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px 16px; }
    .label { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .value { font-size: 15px; color: #111827; word-break: break-word; }
    .badge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; color: ${predictionBadgeClass}; background: ${predictionBadgeBg}; }
    .meter { margin-top: 10px; background: #e5e7eb; border-radius: 999px; height: 10px; overflow: hidden; }
    .meter > span { display: block; height: 100%; width: ${confidencePercent}; background: linear-gradient(90deg, #ef4444, #f59e0b, #22c55e); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 12px 10px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    th { color: #6b7280; font-weight: 600; }
    .note { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; border-radius: 14px; padding: 14px 16px; line-height: 1.7; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; border-radius: 14px; padding: 14px 16px; line-height: 1.7; }
    .footer { padding: 20px 32px 28px; color: #6b7280; font-size: 12px; }
    @media (max-width: 720px) { body { padding: 12px; } .grid { grid-template-columns: 1fr; } .hero, .section, .footer { padding-left: 18px; padding-right: 18px; } }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>${escapeHtml(report.title)}</h1>
      <p>由 Deepfake 检测平台自动生成</p>
    </div>
    <div class="section">
      <h2>基础信息</h2>
      <div class="grid">
        <div class="item"><div class="label">文件名</div><div class="value">${escapeHtml(report.fileName)}</div></div>
        <div class="item"><div class="label">文件类型</div><div class="value">${escapeHtml(report.fileType)}</div></div>
        <div class="item"><div class="label">检测时间</div><div class="value">${escapeHtml(report.detectedAt)}</div></div>
        <div class="item"><div class="label">使用模型</div><div class="value">${escapeHtml(report.modelName)}</div></div>
      </div>
    </div>
    <div class="section">
      <h2>检测结论</h2>
      <div class="grid">
        <div class="item"><div class="label">判定结果</div><div class="value"><span class="badge">${escapeHtml(report.predictionText)}</span></div></div>
        <div class="item"><div class="label">处理时间</div><div class="value">${escapeHtml(report.processingTimeText)}</div></div>
      </div>
      <div class="item" style="margin-top: 16px;">
        <div class="label">${escapeHtml(report.confidenceLabel || getPredictedConfidenceLabel())}</div>
        <div class="value">${escapeHtml(report.confidenceText)}</div>
        <div class="meter"><span></span></div>
      </div>
    </div>
    <div class="section">
      <h2>媒体分析</h2>
      <div class="grid">
        ${mediaAnalysisItems}
      </div>
    </div>
    <div class="section">
      <h2>类别概率</h2>
      <table>
        <thead><tr><th>类别</th><th>概率</th></tr></thead>
        <tbody>${probabilityRows}</tbody>
      </table>
    </div>
    <div class="section">
      <h2>判定辅助指标</h2>
      <table>
        <thead><tr><th>指标</th><th>数值</th></tr></thead>
        <tbody>${decisionMetricRows}</tbody>
      </table>
    </div>
    ${report.errorMessage ? `<div class="section"><div class="error"><strong>错误信息：</strong>${escapeHtml(report.errorMessage)}</div></div>` : ''}
    <div class="section">
      <div class="note">本报告用于辅助研判，不能替代人工审核。若结果为“伪造”或预测结果置信度较低，建议结合原始来源、上下文和其他工具进行交叉验证。</div>
    </div>
    <div class="footer">Deepfake 检测平台 v1.0.0</div>
  </div>
</body>
</html>`;
}

function downloadDetectionReportHtml(report, filenameBase) {
    const html = renderDetectionReportHtml(report);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sanitizeReportFilename(filenameBase)}_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function getDetectionResultByIndex(index) {
    return detectionResultCache[index] || null;
}

function viewDetectionResultDetail(index) {
    const record = getDetectionResultByIndex(index);
    if (!record) {
        showNotification('结果不存在', 'error');
        return;
    }

    const videoMetadataGridItems = buildVideoMetadataItems(record).map(item => `
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">${escapeHtml(item.label)}</label>
                        <p class="text-sm text-gray-900">${escapeHtml(item.value)}</p>
                    </div>
                `).join('');

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-start mb-4">
                <h2 class="text-xl font-semibold text-gray-900">检测结果详情</h2>
                <button onclick="this.closest('.fixed').remove()" class="text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
            <div class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">文件名</label>
                        <p class="text-sm text-gray-900 break-all">${escapeHtml(record.filename)}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测时间</label>
                        <p class="text-sm text-gray-900">${escapeHtml(formatDateTime(record.createdAt))}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">文件类型</label>
                        <p class="text-sm text-gray-900">${record.type === 'video' ? '视频' : '图片'}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">使用模型</label>
                        <p class="text-sm text-gray-900">${escapeHtml(formatDetectionResultDetailModel(record))}</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测结果</label>
                        <p class="text-sm text-gray-900">${record.result === 'real' ? '真实' : record.result === 'fake' ? '伪造' : '失败'}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">处理时间</label>
                        <p class="text-sm text-gray-900">${escapeHtml(record.processingTime || '-')} 秒</p>
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${getPredictedConfidenceLabel()}</label>
                    <p class="text-sm text-gray-900">${escapeHtml(record.result === 'error' ? '-' : `${record.confidence}%`)}</p>
                </div>
                ${record.result !== 'error' && record.decisionMetrics ? `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">判定辅助指标</label>
                    ${renderDecisionMetricGrid(record.decisionMetrics)}
                </div>` : ''}
                ${record.type === 'video' && videoMetadataGridItems ? `
                <div class="grid grid-cols-3 gap-4">
                    ${videoMetadataGridItems}
                </div>` : ''}
                ${record.errorMessage ? `
                <div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 break-all">
                    ${escapeHtml(record.errorMessage)}
                </div>` : ''}
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="downloadDetectionResultReport(${index})" class="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
                    <i class="fas fa-download mr-2"></i> 下载报告
                </button>
                <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors">
                    关闭
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

function formatDetectionResultDetailModel(record) {
    const modelInfo = record?.modelInfo;
    if (modelInfo?.model_name) {
        const metaBits = [];
        if (modelInfo.model_type) {
            metaBits.push(formatModelLabel(modelInfo.model_type));
        }
        if (modelInfo.model_id) {
            metaBits.push(`ID ${modelInfo.model_id}`);
        }
        return metaBits.length ? `${modelInfo.model_name} · ${metaBits.join(' · ')}` : modelInfo.model_name;
    }
    return record?.model || '-';
}

function downloadDetectionResultReport(index) {
    const record = getDetectionResultByIndex(index);
    if (!record) {
        showNotification('结果不存在', 'error');
        return;
    }

    const videoMetadataLines = record.type === 'video'
        ? buildVideoMetadataItems(record).map(item => `- ${item.label}: ${item.value}`).join('\n    ')
        : '';
    const videoMetadataSection = videoMetadataLines ? `\n    ${videoMetadataLines}` : '';

    const reportContent = `
Deepfake 检测报告

检测信息:
    - 文件名: ${record.filename}
    - 文件类型: ${record.type === 'video' ? '视频' : '图片'}
    - 检测时间: ${formatDateTime(record.createdAt)}
    - 使用模型: ${record.model}

检测结果:
    - 判定结果: ${record.result === 'real' ? '真实' : record.result === 'fake' ? '伪造' : '失败'}
    - ${getPredictedConfidenceLabel()}: ${record.result === 'error' ? '-' : `${record.confidence}%`}
    - Fake 概率: ${escapeHtml(formatPercentFromProbability(record.decisionMetrics?.fake_probability))}
    - Real 概率: ${escapeHtml(formatPercentFromProbability(record.decisionMetrics?.real_probability))}
    - ${escapeHtml(getDecisionThresholdLabel(record.decisionMetrics))}: ${escapeHtml(formatPercentFromProbability(record.decisionMetrics?.confidence_threshold))}
    - ${escapeHtml(getThresholdGapLabel(record.decisionMetrics))}: ${escapeHtml(formatSignedPercentFromProbability(record.decisionMetrics?.threshold_gap))}
    - 决策边际: ${escapeHtml(formatSignedPercentFromProbability(record.decisionMetrics?.decision_margin))}
    - 处理时间: ${record.processingTime || '-'} 秒
    ${videoMetadataSection}
    ${record.errorMessage ? `- 错误信息: ${record.errorMessage}` : ''}

生成时间: ${new Date().toLocaleString('zh-CN')}
生成平台: Deepfake 检测平台 v1.0.0
`;

    const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deepfake_result_${sanitizeReportFilename(record.filename, 'result')}_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showNotification('报告下载成功', 'success');
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
                prediction: resultFilter && resultFilter !== 'failed' ? resultFilter : undefined,
                status: resultFilter === 'failed' ? 'failed' : undefined,
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
            const historyOutcome = getHistoryOutcome(record);
            const resultClass = historyOutcome.badgeClass;
            const resultText = historyOutcome.text;
            const confidence = historyOutcome.isFailed ? '-' : formatAccuracy(record.confidence);
            const modelLabel = formatHistoryModelLabel(record);
            const recordId = escapeHtml(String(record.id ?? ''));

            return `
                <tr class="hover:bg-gray-50">
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(formatDateTime(record.created_at))}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(record.file_name)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(modelLabel)}</td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${resultClass}">
                            ${resultText}
                        </span>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(confidence)}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button class="text-primary-600 hover:text-primary-900 mr-3" data-record-id="${recordId}" onclick="viewHistoryDetail(this.dataset.recordId)">查看</button>
                        <button class="text-gray-600 hover:text-gray-900" data-record-id="${recordId}" onclick="downloadReport(this.dataset.recordId)">下载</button>
                        <button class="text-red-600 hover:text-red-800 ml-3" data-record-id="${recordId}" onclick="deleteHistoryRecord(this.dataset.recordId)">删除</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        tbody.innerHTML = rows;
        
        // 显示筛选结果提示
        if (resultFilter || modelFilterValue) {
            const filterText = [];
            if (resultFilter) {
                const filterLabel = resultFilter === 'real'
                    ? '真实'
                    : resultFilter === 'fake'
                    ? '伪造'
                    : '失败';
                filterText.push(`结果: ${filterLabel}`);
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
            const primaryActionLabel = model.is_default ? '默认模型详情' : '查看详情';

            return `
            <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 card-hover">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center">
                        <div class="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center text-white font-bold">
                            ${escapeHtml(model.name.charAt(0))}
                        </div>
                        <div class="ml-3">
                            <h3 class="font-semibold text-gray-900">${escapeHtml(model.name)}</h3>
                            <p class="text-sm text-gray-500">v${escapeHtml(model.version)}</p>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${statusClass}">
                        ${statusLabel}
                    </span>
                </div>
                <p class="text-sm text-gray-600 mb-4">${escapeHtml(model.description || '暂无描述')}</p>
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
                    <button class="flex-1 px-3 py-2 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors" onclick="viewModelDetail(${model.id})">
                        ${primaryActionLabel}
                    </button>
                    ${model.training_job_id ? `
                        <button class="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors" onclick="viewTrainingJob(${model.training_job_id})">
                            关联训练
                        </button>
                    ` : `
                        <button class="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors" onclick="viewModelDetail(${model.id})">
                            详情
                        </button>
                    `}
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

async function viewModelDetail(modelId) {
    renderModelDetailLoading();

    try {
        const response = await axios.get(`${API_BASE_URL}/models/${modelId}`);
        renderModelDetailModal(response.data);
    } catch (error) {
        closeModelDetailModal();
        showNotification('获取模型详情失败：' + getApiErrorMessage(error), 'error');
    }
}

function ensureModelDetailModal() {
    if (modelDetailModal) {
        return modelDetailModal;
    }

    const modal = document.createElement('div');
    modal.id = 'modelDetailModal';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/60 p-4';
    modal.innerHTML = `
        <div class="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                    <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">Model Detail</p>
                    <h3 class="mt-1 text-xl font-semibold text-slate-900">模型详情</h3>
                </div>
                <button type="button" data-role="close-model-detail" class="h-10 w-10 rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="modelDetailBody" class="max-h-[calc(90vh-88px)] overflow-y-auto px-6 py-6"></div>
        </div>
    `;

    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('[data-role="close-model-detail"]')) {
            closeModelDetailModal();
        }
    });

    document.body.appendChild(modal);
    modelDetailModal = modal;
    return modal;
}

function renderModelDetailLoading() {
    const modal = ensureModelDetailModal();
    const body = modal.querySelector('#modelDetailBody');
    if (!body) return;

    body.innerHTML = `
        <div class="flex min-h-[280px] items-center justify-center text-slate-500">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-3xl text-primary-600"></i>
                <p class="mt-4 text-sm">正在从后端加载模型详情...</p>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
}

function closeModelDetailModal() {
    if (!modelDetailModal) {
        return;
    }
    modelDetailModal.classList.add('hidden');
    modelDetailModal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
}

function renderModelDetailModal(model) {
    const modal = ensureModelDetailModal();
    const body = modal.querySelector('#modelDetailBody');
    if (!body) return;

    const metrics = model.metrics || {};
    const advancedMetricCards = [];
    const hasPrecision = hasMetricValue(metrics.precision);
    const hasRecall = hasMetricValue(metrics.recall);
    const hasF1Score = hasMetricValue(metrics.f1_score);
    const hasConfusionMatrix = hasStructuredValue(metrics.confusion_matrix);
    const hasClassificationReport = hasStructuredValue(metrics.classification_report);
    const deploymentInfo = renderJsonPanel(model.deployment_info, '暂无部署信息');
    const parameterInfo = renderJsonPanel(model.parameters, '暂无模型参数');

    if (hasPrecision) {
        advancedMetricCards.push(`<div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">Precision</p><p class="mt-2 text-2xl font-semibold text-slate-900">${formatAccuracy(metrics.precision)}</p></div>`);
    }
    if (hasRecall) {
        advancedMetricCards.push(`<div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">Recall</p><p class="mt-2 text-2xl font-semibold text-slate-900">${formatAccuracy(metrics.recall)}</p></div>`);
    }
    if (hasF1Score) {
        advancedMetricCards.push(`<div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">F1 Score</p><p class="mt-2 text-2xl font-semibold text-slate-900">${formatAccuracy(metrics.f1_score)}</p></div>`);
    }

    const advancedMetricCardsMarkup = advancedMetricCards.length
        ? advancedMetricCards.join('')
        : '<div class="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 xl:col-span-3"><p class="text-xs text-slate-500">高级分类指标</p><p class="mt-2 text-sm leading-6 text-slate-600">当前模型未返回 Precision / Recall / F1 汇总，卡片仅展示后端实际提供的准确率。</p></div>';

    const advancedReportPanelsMarkup = hasConfusionMatrix || hasClassificationReport
        ? `
            <div class="grid gap-6 xl:grid-cols-2">
                ${hasConfusionMatrix ? `
                    <div class="rounded-3xl border border-slate-200 bg-white p-5">
                        <h5 class="text-lg font-semibold text-slate-900">混淆矩阵</h5>
                        <div class="mt-4">${renderJsonPanel(metrics.confusion_matrix, '暂无混淆矩阵')}</div>
                    </div>
                ` : ''}
                ${hasClassificationReport ? `
                    <div class="rounded-3xl border border-slate-200 bg-white p-5">
                        <h5 class="text-lg font-semibold text-slate-900">分类报告</h5>
                        <div class="mt-4">${renderJsonPanel(metrics.classification_report, '暂无分类报告')}</div>
                    </div>
                ` : ''}
            </div>
        `
        : `
            <div class="rounded-3xl border border-slate-200 bg-white p-5">
                <h5 class="text-lg font-semibold text-slate-900">高级报告</h5>
                <div class="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">当前模型未提供混淆矩阵或分类报告，详情页仅展示后端实际返回的指标。</div>
            </div>
        `;

    body.innerHTML = `
        <div class="space-y-6">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
                <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h4 class="text-2xl font-semibold text-slate-900 break-all">${escapeHtml(model.name)}</h4>
                            <p class="mt-2 text-sm text-slate-600">${escapeHtml(formatModelLabel(model.model_type))} · v${escapeHtml(model.version)}</p>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${model.is_default ? '<span class="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">默认模型</span>' : ''}
                            <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${mapModelStatusClass(model.status)}">${escapeHtml(mapModelStatus(model.status))}</span>
                        </div>
                    </div>
                    <p class="mt-4 text-sm leading-6 text-slate-600">${escapeHtml(model.description || '暂无描述')}</p>
                    <div class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div class="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p class="text-xs text-slate-500">准确率</p><p class="mt-2 text-2xl font-semibold text-slate-900">${formatAccuracy(metrics.accuracy)}</p></div>
                        ${advancedMetricCardsMarkup}
                    </div>
                </div>
                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">Registry</p>
                    <div class="mt-4 space-y-3 text-sm text-slate-600">
                        <div class="flex justify-between gap-4"><span>模型 ID</span><span class="text-right text-slate-900">${escapeHtml(String(model.id))}</span></div>
                        <div class="flex justify-between gap-4"><span>输入尺寸</span><span class="text-right text-slate-900">${escapeHtml(String(model.input_size || '-'))}</span></div>
                        <div class="flex justify-between gap-4"><span>类别数</span><span class="text-right text-slate-900">${escapeHtml(String(model.num_classes || '-'))}</span></div>
                        <div class="flex justify-between gap-4"><span>训练任务</span><span class="text-right text-slate-900">${escapeHtml(String(model.training_job_id || '-'))}</span></div>
                        <div class="flex justify-between gap-4"><span>创建时间</span><span class="text-right text-slate-900">${escapeHtml(formatDateTime(model.created_at))}</span></div>
                        <div class="flex justify-between gap-4"><span>更新时间</span><span class="text-right text-slate-900">${escapeHtml(formatDateTime(model.updated_at))}</span></div>
                    </div>
                    <div class="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        <p class="text-xs uppercase tracking-[0.18em] text-slate-400">Model File</p>
                        <p class="mt-2 break-all text-slate-900">${escapeHtml(model.file_path || '未登记')}</p>
                    </div>
                </div>
            </div>

            <div class="grid gap-6 xl:grid-cols-2">
                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <h5 class="text-lg font-semibold text-slate-900">模型参数</h5>
                    <div class="mt-4">${parameterInfo}</div>
                </div>
                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <h5 class="text-lg font-semibold text-slate-900">部署信息</h5>
                    <div class="mt-4">${deploymentInfo}</div>
                </div>
            </div>

            ${advancedReportPanelsMarkup}
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
}

function renderJsonPanel(value, emptyText) {
    if (!value || (typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length)) {
        return `<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">${escapeHtml(emptyText)}</div>`;
    }

    return `<pre class="overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-6 text-slate-100">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

// 训练功能
function initializeTraining() {
    const form = document.getElementById('trainingForm');
    if (form) {
        form.addEventListener('submit', handleTrainingSubmit);
    }

    const statusFilter = document.getElementById('trainingStatusFilter');
    if (statusFilter) {
        statusFilter.addEventListener('change', () => loadTrainingJobs({ silent: true }));
    }

    const datasetSelect = document.getElementById('trainingDatasetPath');
    if (datasetSelect) {
        datasetSelect.addEventListener('change', updateTrainingDatasetHint);
    }

    const refreshDatasetsBtn = document.getElementById('refreshDatasetsBtn');
    if (refreshDatasetsBtn) {
        refreshDatasetsBtn.addEventListener('click', () => loadTrainingDatasets(undefined, { notify: true }));
    }

    const registerDatasetBtn = document.getElementById('registerDatasetBtn');
    if (registerDatasetBtn) {
        registerDatasetBtn.addEventListener('click', () => toggleDatasetRegisterPanel(true, 'path'));
    }

    const uploadDatasetFolderOpenBtn = document.getElementById('uploadDatasetFolderOpenBtn');
    if (uploadDatasetFolderOpenBtn) {
        uploadDatasetFolderOpenBtn.addEventListener('click', () => {
            toggleDatasetRegisterPanel(true, 'folder');
            triggerDatasetFolderPicker();
        });
    }

    const closeDatasetRegisterPanelBtn = document.getElementById('closeDatasetRegisterPanelBtn');
    if (closeDatasetRegisterPanelBtn) {
        closeDatasetRegisterPanelBtn.addEventListener('click', () => toggleDatasetRegisterPanel(false));
    }

    const datasetModePathTab = document.getElementById('datasetModePathTab');
    if (datasetModePathTab) {
        datasetModePathTab.addEventListener('click', () => setDatasetRegisterMode('path'));
    }

    const datasetModeFolderTab = document.getElementById('datasetModeFolderTab');
    if (datasetModeFolderTab) {
        datasetModeFolderTab.addEventListener('click', () => setDatasetRegisterMode('folder'));
    }

    const saveDatasetPathBtn = document.getElementById('saveDatasetPathBtn');
    if (saveDatasetPathBtn) {
        saveDatasetPathBtn.addEventListener('click', saveRegisteredDatasetPath);
    }

    const chooseDatasetFolderBtn = document.getElementById('chooseDatasetFolderBtn');
    if (chooseDatasetFolderBtn) {
        chooseDatasetFolderBtn.addEventListener('click', triggerDatasetFolderPicker);
    }

    const folderPicker = document.getElementById('trainingDatasetFolderPicker');
    if (folderPicker) {
        folderPicker.addEventListener('change', handleDatasetFolderSelection);
    }

    const uploadDatasetFolderBtn = document.getElementById('uploadDatasetFolderBtn');
    if (uploadDatasetFolderBtn) {
        uploadDatasetFolderBtn.addEventListener('click', uploadSelectedDatasetFolder);
    }

    const datasetRegisterPath = document.getElementById('datasetRegisterPath');
    if (datasetRegisterPath) {
        datasetRegisterPath.addEventListener('input', syncDatasetNameFromPathInput);
    }
}

async function loadTrainingDatasets(selectedPath, options = {}) {
    const datasetSelect = document.getElementById('trainingDatasetPath');
    if (!datasetSelect) return;

    const notify = Boolean(options.notify);
    const previousValue = selectedPath || datasetSelect.value;

    try {
        const response = await axios.get(`${API_BASE_URL}/datasets/`, {
            params: { limit: 100 }
        });

        trainingDatasetCache = response.data.datasets || [];
        updateDatasetCatalogBadge();

        if (!trainingDatasetCache.length) {
            datasetSelect.innerHTML = '<option value="">暂无已登记数据集</option>';
            datasetSelect.disabled = true;
            updateTrainingDatasetHint();
            if (notify) {
                showNotification('当前没有已登记的数据集', 'info');
            }
            return;
        }

        datasetSelect.disabled = false;
        datasetSelect.innerHTML = `
            <option value="">选择数据集</option>
            ${trainingDatasetCache.map(dataset => `
                <option value="${escapeHtml(dataset.path)}">${escapeHtml(formatTrainingDatasetOption(dataset))}</option>
            `).join('')}
        `;

        const selectedDataset = trainingDatasetCache.find(dataset => dataset.path === previousValue);
        datasetSelect.value = selectedDataset ? selectedDataset.path : trainingDatasetCache[0].path;
        updateTrainingDatasetHint();

        if (notify) {
            showNotification(`已加载 ${trainingDatasetCache.length} 个数据集`, 'success');
        }
    } catch (error) {
        trainingDatasetCache = [];
        updateDatasetCatalogBadge();
        datasetSelect.innerHTML = '<option value="">加载数据集失败</option>';
        datasetSelect.disabled = true;
        updateTrainingDatasetHint('数据集加载失败，请检查后端数据集接口或点击刷新列表重试。');
        if (notify) {
            showNotification('加载数据集失败：' + getApiErrorMessage(error), 'error');
        }
    }
}

function updateTrainingDatasetHint(customMessage) {
    const hint = document.getElementById('trainingDatasetHint');
    const datasetSelect = document.getElementById('trainingDatasetPath');
    const nameEl = document.getElementById('selectedDatasetName');
    const statusEl = document.getElementById('selectedDatasetStatus');
    const samplesEl = document.getElementById('selectedDatasetSamples');
    if (!hint || !datasetSelect) return;

    if (customMessage) {
        hint.textContent = customMessage;
        if (nameEl) {
            nameEl.textContent = '尚未选择';
            nameEl.title = '尚未选择';
        }
        if (statusEl) {
            statusEl.textContent = '待处理';
            statusEl.title = '待处理';
        }
        if (samplesEl) {
            samplesEl.textContent = '-';
            samplesEl.title = '-';
        }
        return;
    }

    const selectedDataset = trainingDatasetCache.find(dataset => dataset.path === datasetSelect.value);
    if (!selectedDataset) {
        if (nameEl) {
            nameEl.textContent = '尚未选择';
            nameEl.title = '尚未选择';
        }
        if (statusEl) {
            const statusText = datasetSelect.disabled ? '不可用' : '请选择';
            statusEl.textContent = statusText;
            statusEl.title = statusText;
        }
        if (samplesEl) {
            samplesEl.textContent = '-';
            samplesEl.title = '-';
        }
        hint.textContent = datasetSelect.disabled
            ? '请先点击“新增数据集”或“选择文件夹”添加数据集，再刷新列表。'
            : '请选择已登记的数据集；目录建议包含 fake 和 real 子目录。';
        return;
    }

    const sampleCount = selectedDataset.stats?.total_samples ?? '未统计';
    const statusText = mapDatasetStatus(selectedDataset.processing_status, selectedDataset.is_processed);
    if (nameEl) {
        const datasetName = selectedDataset.name || '未命名数据集';
        nameEl.textContent = datasetName;
        nameEl.title = datasetName;
    }
    if (statusEl) {
        statusEl.textContent = statusText;
        statusEl.title = statusText;
    }
    if (samplesEl) {
        const sampleText = typeof sampleCount === 'number' ? `${sampleCount} 条样本` : String(sampleCount);
        samplesEl.textContent = sampleText;
        samplesEl.title = sampleText;
    }
    hint.textContent = `路径: ${selectedDataset.path} | 状态: ${statusText} | 样本数: ${sampleCount}`;
}

function updateDatasetCatalogBadge() {
    const badge = document.getElementById('datasetCatalogBadge');
    if (!badge) return;

    if (!trainingDatasetCache.length) {
        badge.innerHTML = '<i class="fas fa-layer-group text-[11px]"></i><span>暂无数据集</span>';
        return;
    }

    const processedCount = trainingDatasetCache.filter(dataset => dataset.is_processed).length;
    badge.innerHTML = `<i class="fas fa-layer-group text-[11px]"></i><span>${trainingDatasetCache.length} 个数据集 · 已处理 ${processedCount}</span>`;
}

function toggleDatasetRegisterPanel(forceOpen, mode = currentDatasetRegisterMode) {
    const panel = document.getElementById('datasetRegisterPanel');
    if (!panel) return;

    const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);

    if (shouldOpen) {
        setDatasetRegisterMode(mode);
    }

    if (!shouldOpen) {
        clearDatasetRegisterPathForm();
        resetDatasetFolderSelection();
    }
}

function setDatasetRegisterMode(mode) {
    currentDatasetRegisterMode = mode;
    const pathTab = document.getElementById('datasetModePathTab');
    const folderTab = document.getElementById('datasetModeFolderTab');
    const pathSection = document.getElementById('datasetRegisterPathSection');
    const folderSection = document.getElementById('datasetRegisterFolderSection');

    if (pathTab) pathTab.classList.toggle('is-active', mode === 'path');
    if (folderTab) folderTab.classList.toggle('is-active', mode === 'folder');
    if (pathSection) pathSection.classList.toggle('hidden', mode !== 'path');
    if (folderSection) folderSection.classList.toggle('hidden', mode !== 'folder');
}

function startTrainingJobsPolling() {
    if (trainingJobsPollTimer) {
        return;
    }

    updateTrainingPollingStatus(true);
    trainingJobsPollTimer = window.setInterval(() => {
        if (currentSection !== 'training') {
            return;
        }
        loadTrainingJobs({ silent: true });
    }, TRAINING_JOBS_POLL_INTERVAL);
}

function stopTrainingJobsPolling() {
    if (trainingJobsPollTimer) {
        window.clearInterval(trainingJobsPollTimer);
        trainingJobsPollTimer = null;
    }
    updateTrainingPollingStatus(false);
}

function updateTrainingPollingStatus(active, jobs = []) {
    const statusEl = document.getElementById('trainingPollingStatus');
    if (!statusEl) return;

    if (!active) {
        statusEl.textContent = '自动刷新未开启';
        return;
    }

    const intervalSeconds = TRAINING_JOBS_POLL_INTERVAL >= 1000
        ? `${TRAINING_JOBS_POLL_INTERVAL / 1000}秒`
        : `${TRAINING_JOBS_POLL_INTERVAL}ms`;
    const activeJobs = jobs.filter(job => ['pending', 'running'].includes(job.status)).length;
    statusEl.textContent = activeJobs > 0
        ? `自动刷新中（每${intervalSeconds}，活动任务 ${activeJobs}）`
        : `自动刷新中（每${intervalSeconds}）`;
}

async function saveRegisteredDatasetPath() {
    const nameInput = document.getElementById('datasetRegisterName');
    const pathInput = document.getElementById('datasetRegisterPath');
    const descriptionInput = document.getElementById('datasetRegisterDescription');

    const datasetName = nameInput?.value.trim() || '';
    const datasetPath = pathInput?.value.trim() || '';
    const description = descriptionInput?.value.trim() || '';

    if (!datasetName) {
        showNotification('请输入数据集名称', 'warning');
        return;
    }
    if (!datasetPath) {
        showNotification('请输入本地数据集路径', 'warning');
        return;
    }

    showLoading(true);
    try {
        const response = await axios.post(`${API_BASE_URL}/datasets/`, {
            name: datasetName,
            description: description || null,
            path: datasetPath,
            image_size: 224,
            frame_extraction_interval: 4,
            max_frames_per_video: 20
        });

        await loadTrainingDatasets(response.data.path, { notify: false });
        clearDatasetRegisterPathForm();
        toggleDatasetRegisterPanel(false);
        showNotification(`数据集已登记：${response.data.name}`, 'success');
    } catch (error) {
        showNotification('登记数据集失败：' + getApiErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
}

function syncDatasetNameFromPathInput() {
    const nameInput = document.getElementById('datasetRegisterName');
    const pathInput = document.getElementById('datasetRegisterPath');
    if (!nameInput || !pathInput || nameInput.value.trim()) {
        return;
    }

    const guessedName = guessDatasetNameFromPath(pathInput.value.trim());
    if (guessedName && guessedName !== 'local-dataset') {
        nameInput.value = guessedName;
    }
}

function clearDatasetRegisterPathForm() {
    const nameInput = document.getElementById('datasetRegisterName');
    const pathInput = document.getElementById('datasetRegisterPath');
    const descriptionInput = document.getElementById('datasetRegisterDescription');
    if (nameInput) nameInput.value = '';
    if (pathInput) pathInput.value = '';
    if (descriptionInput) descriptionInput.value = '';
}

function triggerDatasetFolderPicker() {
    const folderPicker = document.getElementById('trainingDatasetFolderPicker');
    if (folderPicker) {
        folderPicker.click();
    }
}

function handleDatasetFolderSelection(event) {
    const files = Array.from(event.target.files || []);
    const summaryEl = document.getElementById('datasetFolderSelectionSummary');
    const uploadBtn = document.getElementById('uploadDatasetFolderBtn');
    const uploadNameInput = document.getElementById('datasetUploadName');

    if (!files.length) {
        resetDatasetFolderSelection();
        return;
    }

    selectedTrainingDatasetFiles = files;
    selectedTrainingDatasetRelativePaths = files.map(file => file.webkitRelativePath || file.name);
    const summary = summarizeDatasetFolderSelection(selectedTrainingDatasetRelativePaths);

    if (uploadNameInput && !uploadNameInput.value.trim()) {
        uploadNameInput.value = summary.rootName || 'uploaded-dataset';
    }

    if (summaryEl) {
        summaryEl.className = `dataset-folder-summary p-4 text-sm ${summary.hasExpectedStructure ? 'dataset-folder-summary--ready' : 'dataset-folder-summary--warning'}`;
        summaryEl.innerHTML = `
            <p>已选择文件夹: ${escapeHtml(summary.rootName || '未知目录')}</p>
            <p>文件数: ${summary.totalFiles} | fake: ${summary.fakeCount} | real: ${summary.realCount}</p>
            <p>${summary.hasExpectedStructure ? '已检测到 fake/real 目录结构' : '未完整检测到 fake/real 目录结构，请确认目录内容'}</p>
        `;
    }

    if (uploadBtn) {
        uploadBtn.disabled = !summary.hasExpectedStructure;
    }
}

function summarizeDatasetFolderSelection(relativePaths) {
    const normalizedPaths = relativePaths.map(path => String(path || '').replace(/\\/g, '/'));
    const firstPath = normalizedPaths[0] || '';
    const rootName = firstPath.split('/')[0] || '';
    const fakeCount = normalizedPaths.filter(path => /(^|\/)fake(\/|$)/i.test(path)).length;
    const realCount = normalizedPaths.filter(path => /(^|\/)real(\/|$)/i.test(path)).length;

    return {
        rootName,
        totalFiles: normalizedPaths.length,
        fakeCount,
        realCount,
        hasExpectedStructure: fakeCount > 0 && realCount > 0
    };
}

function resetDatasetFolderSelection() {
    selectedTrainingDatasetFiles = [];
    selectedTrainingDatasetRelativePaths = [];

    const folderPicker = document.getElementById('trainingDatasetFolderPicker');
    const summaryEl = document.getElementById('datasetFolderSelectionSummary');
    const uploadNameInput = document.getElementById('datasetUploadName');
    const uploadDescriptionInput = document.getElementById('datasetUploadDescription');
    const uploadBtn = document.getElementById('uploadDatasetFolderBtn');

    if (folderPicker) folderPicker.value = '';
    if (summaryEl) {
        summaryEl.className = 'dataset-folder-summary p-4 text-sm text-slate-500';
        summaryEl.textContent = '尚未选择文件夹';
    }
    if (uploadNameInput) uploadNameInput.value = '';
    if (uploadDescriptionInput) uploadDescriptionInput.value = '';
    if (uploadBtn) uploadBtn.disabled = true;
}

async function uploadSelectedDatasetFolder() {
    const datasetNameInput = document.getElementById('datasetUploadName');
    const datasetDescriptionInput = document.getElementById('datasetUploadDescription');
    const datasetName = datasetNameInput?.value.trim() || '';
    const description = datasetDescriptionInput?.value.trim() || '';

    if (!selectedTrainingDatasetFiles.length || !selectedTrainingDatasetRelativePaths.length) {
        showNotification('请先选择本地数据集文件夹', 'warning');
        return;
    }
    if (!datasetName) {
        showNotification('请输入上传后数据集名称', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('name', datasetName);
    if (description) {
        formData.append('description', description);
    }

    selectedTrainingDatasetFiles.forEach((file, index) => {
        formData.append('files', file, file.name);
        formData.append('relative_paths', selectedTrainingDatasetRelativePaths[index]);
    });

    showLoading(true);
    try {
        const response = await axios.post(`${API_BASE_URL}/datasets/upload-folder`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        await loadTrainingDatasets(response.data.path, { notify: false });
        resetDatasetFolderSelection();
        toggleDatasetRegisterPanel(false);
        showNotification(`文件夹上传成功：${response.data.name}`, 'success');
    } catch (error) {
        showNotification('上传数据集文件夹失败：' + getApiErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
}

function guessDatasetNameFromPath(datasetPath) {
    const normalizedPath = datasetPath.replace(/[\\/]+$/, '');
    const segments = normalizedPath.split(/[\\/]/).filter(Boolean);
    return segments[segments.length - 1] || 'local-dataset';
}

function formatTrainingDatasetOption(dataset) {
    const statusText = mapDatasetStatus(dataset.processing_status, dataset.is_processed);
    const sampleCount = dataset.stats?.total_samples ?? '未统计';
    return `${dataset.name} | ${statusText} | 样本 ${sampleCount}`;
}

function mapDatasetStatus(processingStatus, isProcessed) {
    if (isProcessed) return '已处理';

    const mapping = {
        pending: '待处理',
        processing: '处理中',
        completed: '已完成',
        failed: '处理失败'
    };
    return mapping[processingStatus] || '未处理';
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
        const trainingDevice = trainingData.training_device || 'mps';

        if (!datasetPath) {
            showNotification('请先选择训练数据集', 'warning');
            return;
        }

        const payload = {
            name: `${modelType.toUpperCase()} 训练任务 ${new Date().toLocaleString('zh-CN')}`,
            description: trainingData.description || null,
            model_type: modelType,
            dataset_path: datasetPath,
            parameters: {
                epochs: epochs,
                learning_rate: learningRate,
                batch_size: batchSize,
                training_device: trainingDevice
            }
        };

        await axios.post(`${API_BASE_URL}/training/jobs`, payload, {
            params: { auto_start: true }
        });

        showNotification('训练任务创建成功！', 'success');
        e.target.reset();
        const datasetSelect = document.getElementById('trainingDatasetPath');
        if (datasetSelect && trainingDatasetCache.length) {
            datasetSelect.value = datasetPath;
        }
        const trainingDeviceSelect = document.getElementById('trainingDevice');
        if (trainingDeviceSelect) {
            trainingDeviceSelect.value = trainingDevice;
        }
        updateTrainingDatasetHint();
        loadTrainingJobs({ silent: true });
    } catch (error) {
        showNotification('创建失败：' + getApiErrorMessage(error), 'error');
    } finally {
        showLoading(false);
    }
}

async function loadTrainingJobs(options = {}) {
    const container = document.getElementById('trainingList');
    if (!container) return;
    const silent = Boolean(options.silent);
    
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
        updateTrainingPollingStatus(currentSection === 'training', jobs);

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
            const totalEpochs = job.total_epochs ?? (typeof epochs === 'number' ? epochs : null);
            const currentEpoch = job.current_epoch ?? (totalEpochs && progress > 0
                ? Math.max(0, Math.round((Math.min(progress, 99) / 100) * totalEpochs))
                : 0);
            const validationAccuracy = formatAccuracy(job.results?.val_accuracy);
            const validationLoss = formatLoss(job.results?.val_loss);
            const startedAt = formatDateTime(job.started_at || job.created_at);
            const completedAt = job.completed_at ? formatDateTime(job.completed_at) : '—';
            const modelLabel = formatModelLabel(job.model_type);
            const modelPath = job.results?.model_path;
            const modelFileStatus = modelPath ? '已生成' : '未生成';
            const trainingDevice = (job.parameters?.training_device || 'auto').toUpperCase();
            const phaseMessage = getTrainingPhaseMessage(job);
            const shouldShowProgress = ['running', 'completed'].includes(job.status);
            const errorMessage = job.error_message || '';
            const epochHint = getTrainingEpochHint(job, progress, currentEpoch, totalEpochs ?? epochs);
            const preprocessingMarkup = buildTrainingPreprocessingMarkup(job);
            const bestCheckpointSummary = getTrainingBestCheckpointSummary(job);
            const bestEpoch = bestCheckpointSummary.bestEpoch;
            const sampleValidationAccuracy = formatAccuracy(job.results?.val_sample_accuracy);
            const sampleValidationLoss = formatLoss(job.results?.val_sample_loss);
            const validationVideoCount = job.results?.val_video_count ?? '-';

            return `
            <div class="border border-gray-200 rounded-xl p-4 hover:border-primary-300 transition-colors shadow-sm">
                <div class="flex justify-between items-start mb-3">
                    <div>
                        <h4 class="font-medium text-gray-900 break-all">${escapeHtml(job.name)}</h4>
                        <p class="text-sm text-gray-500 break-all">${escapeHtml(modelLabel)} • ${escapeHtml(job.dataset_path)}</p>
                        <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
                            <span>设备: ${escapeHtml(trainingDevice)}</span>
                            <span>开始: ${escapeHtml(startedAt)}</span>
                            <span>结束: ${escapeHtml(completedAt)}</span>
                        </div>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${getTrainingStatusClass(job.status)}">
                        ${getTrainingStatusLabel(job.status)}
                    </span>
                </div>
                
                <div class="mb-3 rounded-lg border ${job.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : job.status === 'cancelled' ? 'border-amber-200 bg-amber-50 text-amber-700' : job.status === 'completed' ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700'} px-3 py-2 text-sm">
                    ${escapeHtml(phaseMessage)}
                </div>

                ${preprocessingMarkup}

                ${shouldShowProgress ? `
                    <div class="mb-3">
                        <div class="flex justify-between text-sm mb-1">
                            <span class="text-gray-600">整体进度</span>
                            <span class="font-medium">${progress.toFixed(1)}%</span>
                        </div>
                        <div class="w-full bg-gray-200 rounded-full h-2">
                            <div class="bg-primary-600 h-2 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">${escapeHtml(epochHint)}</p>
                    </div>
                ` : ''}

                ${errorMessage ? `
                    <div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 break-all">
                        ${escapeHtml(errorMessage)}
                    </div>
                ` : ''}
                
                <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2 mb-3">
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${validationAccuracy}</p>
                        <p class="text-xs text-gray-500">视频级验证准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${validationLoss}</p>
                        <p class="text-xs text-gray-500">视频级验证损失</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${sampleValidationAccuracy}</p>
                        <p class="text-xs text-gray-500">样本级验证准确率</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${validationVideoCount}</p>
                        <p class="text-xs text-gray-500">验证视频数</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${bestEpoch ?? '-'}</p>
                        <p class="text-xs text-gray-500">最佳 checkpoint</p>
                    </div>
                    <div class="text-center p-2 bg-gray-50 rounded">
                        <p class="text-sm font-semibold text-gray-900">${epochs}</p>
                        <p class="text-xs text-gray-500">总轮数</p>
                    </div>
                </div>

                <p class="text-[11px] text-gray-400 mb-3">主卡片优先展示视频级验证结果；最佳 checkpoint 按 checkpoint selection score 选出，同分时再比较视频级验证准确率与损失。</p>

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

        if (trainingDetailJobId && trainingDetailModal && !trainingDetailModal.classList.contains('hidden')) {
            const activeJob = jobs.find(job => job.id === trainingDetailJobId);
            if (activeJob && ['pending', 'running'].includes(activeJob.status)) {
                renderTrainingDetailModalLoading(trainingDetailJobId, true);
                refreshTrainingDetailModal(trainingDetailJobId, { silent: true });
            }
        }
    } catch (error) {
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>加载失败</p>
            </div>
        `;
        if (!silent) {
            showNotification('加载训练任务失败：' + getApiErrorMessage(error), 'error');
        }
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
    renderTrainingDetailModalLoading(jobId, false);
    await refreshTrainingDetailModal(jobId);
}

async function refreshTrainingDetailModal(jobId, options = {}) {
    try {
        const metricsPromise = axios
            .get(`${API_BASE_URL}/training/jobs/${jobId}/epoch-metrics`)
            .then(response => ({ ok: true, data: response.data }))
            .catch(error => ({ ok: false, error }));
        const jobResponse = await axios.get(`${API_BASE_URL}/training/jobs/${jobId}`);
        const job = jobResponse.data;
        let metricsResponse = null;
        const metricsResult = await metricsPromise;
        if (metricsResult.ok) {
            metricsResponse = metricsResult.data;
        } else {
            metricsResponse = {
                job_id: job.id,
                job_name: job.name,
                model_type: job.model_type,
                total_epochs: job.total_epochs ?? job.parameters?.epochs ?? null,
                completed_epochs: job.current_epoch ?? 0,
                available: false,
                metrics: [],
                load_error_message: getApiErrorMessage(metricsResult.error)
            };
            if (!options.silent) {
                showNotification(`训练详情已打开，但训练曲线加载失败：${metricsResponse.load_error_message}`, 'warning');
            }
        }

        renderTrainingDetailModal(job, metricsResponse);
    } catch (error) {
        closeTrainingDetailModal();
        if (!options.silent) {
            showNotification('获取详情失败：' + getApiErrorMessage(error), 'error');
        }
    }
}

function ensureTrainingDetailModal() {
    if (trainingDetailModal) {
        return trainingDetailModal;
    }

    const modal = document.createElement('div');
    modal.id = 'trainingDetailModal';
    modal.className = 'fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/60 p-4';
    modal.innerHTML = `
        <div class="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div class="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                    <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">Training Detail</p>
                    <h3 class="mt-1 text-xl font-semibold text-slate-900">训练任务详情</h3>
                </div>
                <button type="button" data-role="close-training-detail" class="h-10 w-10 rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div id="trainingDetailBody" class="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-6"></div>
        </div>
    `;

    modal.addEventListener('click', event => {
        if (event.target === modal || event.target.closest('[data-role="close-training-detail"]')) {
            closeTrainingDetailModal();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && trainingDetailModal && !trainingDetailModal.classList.contains('hidden')) {
            closeTrainingDetailModal();
        }
    });

    document.body.appendChild(modal);
    trainingDetailModal = modal;
    return modal;
}

function renderTrainingDetailModalLoading(jobId, isRefreshing) {
    const modal = ensureTrainingDetailModal();
    const body = modal.querySelector('#trainingDetailBody');
    trainingDetailJobId = jobId;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');

    if (!body || isRefreshing) {
        return;
    }

    body.innerHTML = `
        <div class="flex min-h-[320px] items-center justify-center text-slate-500">
            <div class="text-center">
                <i class="fas fa-spinner fa-spin text-3xl text-primary-600"></i>
                <p class="mt-4 text-sm">正在加载训练详情...</p>
            </div>
        </div>
    `;
}

function closeTrainingDetailModal() {
    if (trainingEpochChart) {
        trainingEpochChart.destroy();
        trainingEpochChart = null;
    }
    if (trainingDetailModal) {
        trainingDetailModal.classList.add('hidden');
        trainingDetailModal.classList.remove('flex');
    }
    trainingDetailJobId = null;
    document.body.classList.remove('overflow-hidden');
}

function renderTrainingDetailModal(job, metricsResponse) {
    const modal = ensureTrainingDetailModal();
    const body = modal.querySelector('#trainingDetailBody');
    if (!body) return;

    trainingDetailJobId = job.id;
    const progress = typeof job.progress === 'number' ? job.progress : 0;
    const totalEpochs = job.total_epochs ?? job.parameters?.epochs ?? metricsResponse?.total_epochs ?? '-';
    const currentEpoch = job.current_epoch ?? metricsResponse?.completed_epochs ?? 0;
    const latestMetric = getLatestTrainingMetric(metricsResponse);
    const bestCheckpointSummary = getTrainingBestCheckpointSummary(job, metricsResponse);
    const bestMetric = bestCheckpointSummary.metric;
    const phaseMessage = getTrainingPhaseMessage(job);
    const trainingDevice = (job.parameters?.training_device || 'auto').toUpperCase();
    const validationAccuracy = formatAccuracy(job.results?.val_accuracy);
    const validationLoss = formatLoss(job.results?.val_loss);
    const sampleValidationAccuracy = formatAccuracy(job.results?.val_sample_accuracy ?? latestMetric?.val_sample_accuracy);
    const sampleValidationLoss = formatLoss(job.results?.val_sample_loss ?? latestMetric?.val_sample_loss);
    const validationVideoCount = job.results?.val_video_count ?? latestMetric?.val_video_count ?? '-';
    const latestTrainAccuracy = formatAccuracy(latestMetric?.train_accuracy);
    const latestTrainLoss = formatLoss(latestMetric?.train_loss);
    const latestValAccuracy = formatAccuracy(latestMetric?.val_accuracy ?? job.results?.val_accuracy);
    const latestValLoss = formatLoss(latestMetric?.val_loss ?? job.results?.val_loss);
    const latestSampleValAccuracy = formatAccuracy(latestMetric?.val_sample_accuracy ?? job.results?.val_sample_accuracy);
    const latestSampleValLoss = formatLoss(latestMetric?.val_sample_loss ?? job.results?.val_sample_loss);
    const bestValAccuracy = formatAccuracy(bestCheckpointSummary.valAccuracy);
    const bestValLoss = formatLoss(bestCheckpointSummary.valLoss);
    const bestSampleValAccuracy = formatAccuracy(bestCheckpointSummary.valSampleAccuracy);
    const bestSampleValLoss = formatLoss(bestCheckpointSummary.valSampleLoss);
    const bestCheckpointScore = formatCheckpointSelectionScore(bestCheckpointSummary.selectionScore);
    const preprocessingMarkup = buildTrainingPreprocessingMarkup(job);
    const chartDownloadDisabled = !metricsResponse?.available;
    const metricsLoadError = metricsResponse?.load_error_message || null;

    body.innerHTML = `
        <div class="space-y-6">
            <div class="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                <div class="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h4 class="text-xl font-semibold text-slate-900 break-all">${escapeHtml(job.name)}</h4>
                            <p class="mt-2 text-sm text-slate-600 break-all">${escapeHtml(formatModelLabel(job.model_type))} · ${escapeHtml(job.dataset_path)}</p>
                        </div>
                        <span class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${getTrainingStatusClass(job.status)}">
                            ${escapeHtml(getTrainingStatusLabel(job.status))}
                        </span>
                    </div>
                    <div class="mt-4 rounded-2xl border ${job.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : job.status === 'cancelled' ? 'border-amber-200 bg-amber-50 text-amber-700' : job.status === 'completed' ? 'border-green-200 bg-green-50 text-green-700' : 'border-blue-200 bg-blue-50 text-blue-700'} px-4 py-3 text-sm">
                        ${escapeHtml(phaseMessage)}
                    </div>
                    <div class="mt-4">
                        ${preprocessingMarkup || ''}
                        <div>
                            <div class="flex items-center justify-between text-sm text-slate-600">
                                <span>整体进度</span>
                                <span class="font-semibold text-slate-900">${progress.toFixed(1)}%</span>
                            </div>
                            <div class="mt-2 h-3 w-full rounded-full bg-slate-200">
                                <div class="h-3 rounded-full bg-primary-600 transition-all duration-300" style="width: ${Math.max(0, Math.min(100, progress))}%"></div>
                            </div>
                            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                <span>${escapeHtml(getTrainingEpochHint(job, progress, currentEpoch, totalEpochs))}</span>
                                <span>设备: ${escapeHtml(trainingDevice)}</span>
                                <span>已训练: ${escapeHtml(String(job.results?.epochs_trained ?? metricsResponse?.completed_epochs ?? 0))} 轮</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <p class="text-[11px] uppercase tracking-[0.22em] text-slate-400">Job Info</p>
                    <div class="mt-4 space-y-3 text-sm text-slate-600">
                        <div class="flex justify-between gap-4"><span>创建时间</span><span class="text-right text-slate-900">${escapeHtml(formatDateTime(job.created_at))}</span></div>
                        <div class="flex justify-between gap-4"><span>开始时间</span><span class="text-right text-slate-900">${escapeHtml(formatDateTime(job.started_at || job.created_at))}</span></div>
                        <div class="flex justify-between gap-4"><span>结束时间</span><span class="text-right text-slate-900">${escapeHtml(formatDateTime(job.completed_at))}</span></div>
                        <div class="flex justify-between gap-4"><span>学习率</span><span class="text-right text-slate-900">${escapeHtml(String(job.parameters?.learning_rate ?? '-'))}</span></div>
                        <div class="flex justify-between gap-4"><span>批次大小</span><span class="text-right text-slate-900">${escapeHtml(String(job.parameters?.batch_size ?? '-'))}</span></div>
                        <div class="flex justify-between gap-4"><span>模型文件</span><span class="text-right text-slate-900 break-all">${escapeHtml(job.results?.model_path || '未生成')}</span></div>
                    </div>
                    ${job.description ? `<div class="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">${escapeHtml(job.description)}</div>` : ''}
                    ${job.error_message ? `<div class="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 break-all">${escapeHtml(job.error_message)}</div>` : ''}
                </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新训练准确率</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestTrainAccuracy}</p><p class="mt-1 text-xs text-slate-400">基于最近一个 epoch</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新视频级验证准确率</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestValAccuracy}</p><p class="mt-1 text-xs text-slate-400">任务顶部摘要以视频级验证为主</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新训练损失</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestTrainLoss}</p><p class="mt-1 text-xs text-slate-400">训练集 loss</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新视频级验证损失</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestValLoss}</p><p class="mt-1 text-xs text-slate-400">当前任务摘要 ${validationAccuracy} / ${validationLoss}</p></div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新样本级验证准确率</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestSampleValAccuracy}</p><p class="mt-1 text-xs text-slate-400">clip / frame 聚合前指标</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">最新样本级验证损失</p><p class="mt-2 text-2xl font-semibold text-slate-900">${latestSampleValLoss}</p><p class="mt-1 text-xs text-slate-400">用于辅助判断聚合前表现</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">验证视频数</p><p class="mt-2 text-2xl font-semibold text-slate-900">${escapeHtml(String(validationVideoCount))}</p><p class="mt-1 text-xs text-slate-400">按 source_id 聚合后统计</p></div>
                <div class="rounded-2xl border border-slate-200 bg-white p-4"><p class="text-xs text-slate-500">当前视频/样本差异</p><p class="mt-2 text-2xl font-semibold text-slate-900">${validationAccuracy}</p><p class="mt-1 text-xs text-slate-400">视频级 ${validationLoss} · 样本级 ${sampleValidationLoss}</p></div>
            </div>

            <div class="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h5 class="text-lg font-semibold text-slate-900">训练曲线</h5>
                            <p class="mt-1 text-sm text-slate-500">曲线中的验证指标优先显示视频级聚合结果；表格中会额外保留样本级结果。</p>
                        </div>
                        <button type="button" onclick="downloadTrainingEpochChartSvg(${job.id})" class="inline-flex items-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 ${chartDownloadDisabled ? 'cursor-not-allowed opacity-50' : ''}" ${chartDownloadDisabled ? 'disabled' : ''}>
                            <i class="fas fa-download mr-2"></i>下载 SVG
                        </button>
                    </div>
                    <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p class="text-sm font-semibold text-slate-900">图表筛选</p>
                                <p class="mt-1 text-xs text-slate-500">可略去部分参数，只看你当前关心的变化趋势。</p>
                            </div>
                            <div class="flex flex-wrap gap-2">
                                <button type="button" onclick="setTrainingChartPreset('video')" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white">只看视频级验证</button>
                                <button type="button" onclick="setTrainingChartPreset('sample')" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white">只看样本级验证</button>
                                <button type="button" onclick="setTrainingChartPreset('loss')" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white">只看损失</button>
                                <button type="button" onclick="setTrainingChartPreset('all')" class="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-white">显示全部</button>
                            </div>
                        </div>
                        <div id="trainingChartMetricControls" class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"></div>
                    </div>
                    <div class="mt-5 h-80">
                        <canvas id="trainingEpochChartCanvas"></canvas>
                    </div>
                    ${metricsLoadError ? `<div class="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">训练曲线暂时不可用：${escapeHtml(metricsLoadError)}</div>` : ''}
                    ${metricsResponse?.available ? '' : '<p class="mt-4 text-sm text-slate-500">当前还没有可展示的 epoch 历史，训练开始并进入 epoch 后会自动出现。</p>'}
                </div>

                <div class="rounded-3xl border border-slate-200 bg-white p-5">
                    <h5 class="text-lg font-semibold text-slate-900">关键节点</h5>
                    <div class="mt-4 space-y-4 text-sm text-slate-600">
                        <div class="rounded-2xl bg-slate-50 p-4">
                            <p class="text-xs uppercase tracking-[0.18em] text-slate-400">Latest</p>
                            <p class="mt-2 text-slate-900">最近记录 epoch: ${escapeHtml(String(latestMetric?.epoch ?? metricsResponse?.completed_epochs ?? '-'))}</p>
                            <p class="mt-1">视频级验证准确率: <span class="font-semibold text-slate-900">${latestValAccuracy}</span></p>
                            <p class="mt-1">视频级验证损失: <span class="font-semibold text-slate-900">${latestValLoss}</span></p>
                            <p class="mt-1">样本级验证准确率: <span class="font-semibold text-slate-900">${latestSampleValAccuracy}</span></p>
                            <p class="mt-1">样本级验证损失: <span class="font-semibold text-slate-900">${latestSampleValLoss}</span></p>
                        </div>
                        <div class="rounded-2xl bg-slate-50 p-4">
                            <p class="text-xs uppercase tracking-[0.18em] text-slate-400">Best Checkpoint</p>
                            <p class="mt-2 text-slate-900">最佳 epoch: ${escapeHtml(String(bestCheckpointSummary.bestEpoch ?? '-'))}</p>
                            <p class="mt-1 text-slate-900">checkpoint selection score: <span class="font-semibold text-slate-900">${bestCheckpointScore}</span></p>
                            <p class="mt-1 text-xs text-slate-500">后端按 checkpoint selection score 选取 checkpoint；同分时再比较视频级验证准确率与损失。</p>
                            <p class="mt-1">最佳视频级验证准确率: <span class="font-semibold text-slate-900">${bestValAccuracy}</span></p>
                            <p class="mt-1">对应视频级验证损失: <span class="font-semibold text-slate-900">${bestValLoss}</span></p>
                            <p class="mt-1">对应样本级验证准确率: <span class="font-semibold text-slate-900">${bestSampleValAccuracy}</span></p>
                            <p class="mt-1">对应样本级验证损失: <span class="font-semibold text-slate-900">${bestSampleValLoss}</span></p>
                        </div>
                        <div class="rounded-2xl bg-slate-50 p-4">
                            <p class="text-xs uppercase tracking-[0.18em] text-slate-400">Retention</p>
                            <p class="mt-2">训练完成后模型是否保留仍由人工决定；检测时会真实复用已保留模型。</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-5">
                <div class="flex items-center justify-between gap-3">
                    <div>
                        <h5 class="text-lg font-semibold text-slate-900">Epoch 历史</h5>
                        <p class="mt-1 text-sm text-slate-500">逐轮查看训练指标、视频级验证指标与样本级验证指标。</p>
                    </div>
                    <span class="text-sm text-slate-500">已记录 ${escapeHtml(String(metricsResponse?.completed_epochs ?? 0))} / ${escapeHtml(String(metricsResponse?.total_epochs ?? totalEpochs))} 轮</span>
                </div>
                <div class="mt-4 overflow-x-auto">
                    ${renderTrainingEpochMetricsTable(metricsResponse)}
                </div>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    renderTrainingChartMetricControls();
    renderTrainingEpochChart(metricsResponse);
}

function getTrainingChartMetricDefinitions() {
    return [
        { key: 'trainAccuracy', label: '训练准确率', colorClass: 'bg-blue-500' },
        { key: 'videoValAccuracy', label: '视频级验证准确率', colorClass: 'bg-sky-500' },
        { key: 'sampleValAccuracy', label: '样本级验证准确率', colorClass: 'bg-cyan-500' },
        { key: 'trainLoss', label: '训练损失', colorClass: 'bg-rose-400' },
        { key: 'videoValLoss', label: '视频级验证损失', colorClass: 'bg-amber-500' },
        { key: 'sampleValLoss', label: '样本级验证损失', colorClass: 'bg-orange-400' }
    ];
}

function renderTrainingChartMetricControls() {
    const container = document.getElementById('trainingChartMetricControls');
    if (!container) return;

    container.innerHTML = getTrainingChartMetricDefinitions().map(metric => {
        const checked = trainingChartMetricVisibility[metric.key] !== false;
        return `
            <label class="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-colors hover:border-primary-300 hover:bg-primary-50/30">
                <span class="flex items-center gap-3">
                    <span class="h-2.5 w-2.5 rounded-full ${metric.colorClass}"></span>
                    <span>${escapeHtml(metric.label)}</span>
                </span>
                <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" ${checked ? 'checked' : ''} onchange="toggleTrainingChartMetric('${metric.key}')">
            </label>
        `;
    }).join('');
}

function toggleTrainingChartMetric(metricKey) {
    trainingChartMetricVisibility = {
        ...trainingChartMetricVisibility,
        [metricKey]: !trainingChartMetricVisibility[metricKey]
    };
    renderTrainingChartMetricControls();
    updateTrainingEpochChartVisibility();
}

function setTrainingChartPreset(preset) {
    if (preset === 'video') {
        trainingChartMetricVisibility = {
            trainAccuracy: true,
            videoValAccuracy: true,
            sampleValAccuracy: false,
            trainLoss: true,
            videoValLoss: true,
            sampleValLoss: false
        };
    } else if (preset === 'sample') {
        trainingChartMetricVisibility = {
            trainAccuracy: false,
            videoValAccuracy: false,
            sampleValAccuracy: true,
            trainLoss: false,
            videoValLoss: false,
            sampleValLoss: true
        };
    } else if (preset === 'loss') {
        trainingChartMetricVisibility = {
            trainAccuracy: false,
            videoValAccuracy: false,
            sampleValAccuracy: false,
            trainLoss: true,
            videoValLoss: true,
            sampleValLoss: true
        };
    } else {
        trainingChartMetricVisibility = {
            trainAccuracy: true,
            videoValAccuracy: true,
            sampleValAccuracy: true,
            trainLoss: true,
            videoValLoss: true,
            sampleValLoss: true
        };
    }

    renderTrainingChartMetricControls();
    updateTrainingEpochChartVisibility();
}

function updateTrainingEpochChartVisibility() {
    if (!trainingEpochChart) return;

    trainingEpochChart.data.datasets.forEach(dataset => {
        dataset.hidden = trainingChartMetricVisibility[dataset.metricKey] === false;
    });
    trainingEpochChart.update();
}

function renderTrainingEpochMetricsTable(metricsResponse) {
    const metrics = metricsResponse?.metrics || [];
    if (!metrics.length) {
        return '<div class="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">暂无 epoch 历史数据</div>';
    }

    const rows = metrics.map(point => `
        <tr class="border-b border-slate-100 last:border-b-0">
            <td class="px-4 py-3 text-slate-900">${point.epoch}</td>
            <td class="px-4 py-3 text-slate-600">${formatAccuracy(point.train_accuracy)}</td>
            <td class="px-4 py-3 text-slate-600">${formatAccuracy(point.val_accuracy)}</td>
            <td class="px-4 py-3 text-slate-600">${formatAccuracy(point.val_sample_accuracy)}</td>
            <td class="px-4 py-3 text-slate-600">${formatLoss(point.train_loss)}</td>
            <td class="px-4 py-3 text-slate-600">${formatLoss(point.val_loss)}</td>
            <td class="px-4 py-3 text-slate-600">${formatLoss(point.val_sample_loss)}</td>
            <td class="px-4 py-3 text-slate-600">${point.val_video_count ?? '-'}</td>
            <td class="px-4 py-3 text-slate-600">${point.learning_rate !== null && point.learning_rate !== undefined ? escapeHtml(String(point.learning_rate)) : '-'}</td>
            <td class="px-4 py-3 text-slate-500">${escapeHtml(formatDateTime(point.recorded_at))}</td>
        </tr>
    `).join('');

    return `
        <table class="min-w-full text-sm">
            <thead>
                <tr class="border-b border-slate-200 text-left text-xs uppercase tracking-[0.16em] text-slate-400">
                    <th class="px-4 py-3 font-medium">Epoch</th>
                    <th class="px-4 py-3 font-medium">Train Acc</th>
                    <th class="px-4 py-3 font-medium">Val Acc (Video)</th>
                    <th class="px-4 py-3 font-medium">Val Acc (Sample)</th>
                    <th class="px-4 py-3 font-medium">Train Loss</th>
                    <th class="px-4 py-3 font-medium">Val Loss (Video)</th>
                    <th class="px-4 py-3 font-medium">Val Loss (Sample)</th>
                    <th class="px-4 py-3 font-medium">Val Videos</th>
                    <th class="px-4 py-3 font-medium">LR</th>
                    <th class="px-4 py-3 font-medium">Recorded At</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

function renderTrainingEpochChart(metricsResponse) {
    const canvas = document.getElementById('trainingEpochChartCanvas');
    if (!canvas) return;

    if (trainingEpochChart) {
        trainingEpochChart.destroy();
        trainingEpochChart = null;
    }

    const metrics = metricsResponse?.metrics || [];
    if (!metrics.length) {
        return;
    }

    const labels = metrics.map(point => `Epoch ${point.epoch}`);
    trainingEpochChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: '训练准确率',
                    metricKey: 'trainAccuracy',
                    data: metrics.map(point => point.train_accuracy !== null && point.train_accuracy !== undefined ? point.train_accuracy * 100 : null),
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.16)',
                    yAxisID: 'yAccuracy',
                    tension: 0.3,
                    spanGaps: true
                },
                {
                    label: '视频级验证准确率',
                    metricKey: 'videoValAccuracy',
                    data: metrics.map(point => point.val_accuracy !== null && point.val_accuracy !== undefined ? point.val_accuracy * 100 : null),
                    borderColor: 'rgb(14, 165, 233)',
                    backgroundColor: 'rgba(14, 165, 233, 0.16)',
                    borderDash: [6, 4],
                    yAxisID: 'yAccuracy',
                    tension: 0.3,
                    spanGaps: true
                },
                {
                    label: '样本级验证准确率',
                    metricKey: 'sampleValAccuracy',
                    data: metrics.map(point => point.val_sample_accuracy !== null && point.val_sample_accuracy !== undefined ? point.val_sample_accuracy * 100 : null),
                    borderColor: 'rgb(34, 211, 238)',
                    backgroundColor: 'rgba(34, 211, 238, 0.16)',
                    borderDash: [2, 5],
                    yAxisID: 'yAccuracy',
                    tension: 0.3,
                    spanGaps: true
                },
                {
                    label: '训练损失',
                    metricKey: 'trainLoss',
                    data: metrics.map(point => point.train_loss ?? null),
                    borderColor: 'rgb(248, 113, 113)',
                    backgroundColor: 'rgba(248, 113, 113, 0.16)',
                    yAxisID: 'yLoss',
                    tension: 0.3,
                    spanGaps: true
                },
                {
                    label: '视频级验证损失',
                    metricKey: 'videoValLoss',
                    data: metrics.map(point => point.val_loss ?? null),
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'rgba(245, 158, 11, 0.16)',
                    borderDash: [6, 4],
                    yAxisID: 'yLoss',
                    tension: 0.3,
                    spanGaps: true
                },
                {
                    label: '样本级验证损失',
                    metricKey: 'sampleValLoss',
                    data: metrics.map(point => point.val_sample_loss ?? null),
                    borderColor: 'rgb(251, 146, 60)',
                    backgroundColor: 'rgba(251, 146, 60, 0.16)',
                    borderDash: [2, 5],
                    yAxisID: 'yLoss',
                    tension: 0.3,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top'
                }
            },
            scales: {
                yAccuracy: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    max: 100,
                    ticks: {
                        callback: value => `${value}%`
                    },
                    title: {
                        display: true,
                        text: '准确率'
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.12)'
                    }
                },
                yLoss: {
                    type: 'linear',
                    position: 'right',
                    title: {
                        display: true,
                        text: '损失'
                    },
                    grid: {
                        drawOnChartArea: false
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

    updateTrainingEpochChartVisibility();
}

async function downloadTrainingEpochChartSvg(jobId) {
    try {
        const response = await axios.get(`${API_BASE_URL}/training/jobs/${jobId}/epoch-metrics/chart`, {
            responseType: 'blob'
        });
        const blob = new Blob([response.data], { type: 'image/svg+xml;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `training_job_${jobId}_epoch_metrics.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        showNotification('训练曲线 SVG 已下载', 'success');
    } catch (error) {
        showNotification('下载训练曲线失败：' + getApiErrorMessage(error), 'error');
    }
}

async function retainTrainingModel(jobId) {
    try {
        const response = await axios.post(`${API_BASE_URL}/training/jobs/${jobId}/model/retain`);
        const modelName = response.data.model_name || '模型';
        showNotification(`已保留模型：${modelName}`, 'success');
        loadDetectionModels();
        loadModels();
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
        loadDetectionModels();
        loadModels();
        loadTrainingJobs();
    } catch (error) {
        showNotification('删除模型失败：' + getApiErrorMessage(error), 'error');
    }
}

function serializeDetectionModel(model) {
    if (model?.source === 'registry' && model?.id) {
        return `id:${model.id}`;
    }
    return `type:${model?.model_type || model?.name || ''}`;
}

function parseDetectionModelSelection(value) {
    const selected = detectionModelCache.find(model => serializeDetectionModel(model) === value);
    if (selected) {
        return {
            modelId: selected.id || null,
            modelType: selected.model_type || null,
            label: selected.name || selected.label || '-',
            usableFor: selected.usable_for || ['image', 'video']
        };
    }

    if (value.startsWith('id:')) {
        return { modelId: Number(value.slice(3)), modelType: null, label: value, usableFor: ['image', 'video'] };
    }
    if (value.startsWith('type:')) {
        const modelType = value.slice(5);
        return { modelId: null, modelType, label: formatModelLabel(modelType), usableFor: modelType === 'lrcn' ? ['video'] : ['image', 'video'] };
    }
    return { modelId: null, modelType: null, label: '-', usableFor: ['image', 'video'] };
}

function appendDetectionModelSelection(formData, selectedModel) {
    if (!selectedModel) {
        return;
    }
    if (selectedModel.modelId) {
        formData.append('model_id', selectedModel.modelId);
    } else if (selectedModel.modelType) {
        formData.append('model_type', selectedModel.modelType);
    }
}

function getDetectionConfidenceThreshold() {
    const input = document.getElementById('confidenceThreshold');
    const parsed = Number.parseFloat(input?.value ?? '0.5');
    if (!Number.isFinite(parsed)) return 0.5;
    return Math.max(0, Math.min(1, parsed));
}

function appendDetectionRequestOptions(formData) {
    formData.append('confidence_threshold', String(getDetectionConfidenceThreshold()));
    formData.append('return_probabilities', 'true');
}

function formatPercentFromProbability(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatSignedPercentFromProbability(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    const percentValue = Number(value) * 100;
    return `${percentValue >= 0 ? '+' : ''}${percentValue.toFixed(1)}%`;
}

function formatInlineWidthPercent(value) {
    const numericValue = Number.parseFloat(value);
    if (!Number.isFinite(numericValue)) return '0%';
    return `${Math.max(0, Math.min(100, numericValue)).toFixed(1)}%`;
}

function getPredictedConfidenceLabel() {
    return '预测结果置信度';
}

function getDecisionThresholdLabel(decisionMetrics) {
    return decisionMetrics?.threshold_applied_to_fake === false ? '判定阈值' : 'Fake 判定阈值';
}

function getThresholdGapLabel(decisionMetrics) {
    return decisionMetrics?.threshold_applied_to_fake === false ? '阈值差值' : 'Fake 概率 - Fake 判定阈值';
}

function buildDecisionMetricItems(decisionMetrics) {
    if (!decisionMetrics) return [];

    const items = [
        { label: 'Fake 概率', value: formatPercentFromProbability(decisionMetrics.fake_probability) },
        { label: 'Real 概率', value: formatPercentFromProbability(decisionMetrics.real_probability) },
        { label: getDecisionThresholdLabel(decisionMetrics), value: formatPercentFromProbability(decisionMetrics.confidence_threshold) },
        { label: getThresholdGapLabel(decisionMetrics), value: formatSignedPercentFromProbability(decisionMetrics.threshold_gap) },
        { label: '预测结果置信度', value: formatPercentFromProbability(decisionMetrics.predicted_probability) },
        { label: '决策边际', value: formatSignedPercentFromProbability(decisionMetrics.decision_margin) }
    ];

    if (typeof decisionMetrics.threshold_applied_to_fake === 'boolean') {
        items.splice(4, 0, {
            label: '阈值作用对象',
            value: decisionMetrics.threshold_applied_to_fake ? 'Fake 类' : '预测类'
        });
    }

    return items;
}

function renderDecisionMetricGrid(decisionMetrics, columns = 'grid-cols-2 md:grid-cols-3') {
    const items = buildDecisionMetricItems(decisionMetrics);
    if (!items.length) {
        return '';
    }

    return `
        <div class="grid ${columns} gap-3">
            ${items.map(item => `
                <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
                    <p class="text-xs text-gray-500">${escapeHtml(item.label)}</p>
                    <p class="mt-1 text-sm font-semibold text-gray-900">${escapeHtml(item.value)}</p>
                </div>
            `).join('')}
        </div>
    `;
}

function renderDecisionMetricTableRows(decisionMetrics) {
    const items = buildDecisionMetricItems(decisionMetrics);
    if (!items.length) {
        return '<tr><td colspan="2">未返回判定辅助指标</td></tr>';
    }
    return items.map(item => `
        <tr>
            <td>${escapeHtml(item.label)}</td>
            <td>${escapeHtml(item.value)}</td>
        </tr>
    `).join('');
}

function canUseModelForFiles(selectedModel, files) {
    if (!selectedModel?.usableFor?.length) {
        return true;
    }
    return files.every(file => {
        const fileKind = isVideoFile(file.name) || file.type.startsWith('video/') ? 'video' : 'image';
        return selectedModel.usableFor.includes(fileKind);
    });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

function hasMetricValue(value) {
    return value !== null && value !== undefined && value !== '';
}

function hasStructuredValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
}

function toFiniteNumber(value, fallback) {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function formatCheckpointSelectionScore(value) {
    const numeric = toFiniteNumber(value, null);
    return numeric === null ? '-' : numeric.toFixed(4);
}

function getTrainingStatusLabel(status) {
    const mapping = {
        running: '训练中',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消',
        pending: '等待中'
    };
    return mapping[status] || status || '-';
}

function getTrainingStatusClass(status) {
    if (status === 'running') return 'bg-blue-100 text-blue-800';
    if (status === 'completed') return 'bg-green-100 text-green-800';
    if (status === 'failed') return 'bg-red-100 text-red-800';
    if (status === 'cancelled') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-800';
}

function getTrainingPhaseMessage(job) {
    return job.progress_message || (job.status === 'completed'
        ? '训练完成，可决定是否保留模型文件'
        : job.status === 'failed'
        ? '训练失败'
        : job.status === 'cancelled'
        ? '训练已取消'
        : job.status === 'running'
        ? '训练进行中'
        : '等待开始训练');
}

function formatTrainingPreprocessingStage(stage) {
    const mapping = {
        scan_dataset: '扫描数据集',
        prepare_temporal_dataset: '准备时序数据集',
        prepare_sequence_dataset: '准备视频片段',
        collect_media_sources: '收集图像与视频源',
        collect_train_samples: '收集训练样本',
        collect_val_samples: '收集验证样本',
        expand_train_video_samples: '展开训练集视频采样帧',
        expand_val_video_samples: '展开验证集视频采样帧',
        cache_video_frames: '缓存视频帧',
        build_dataloader: '构建数据加载器',
        scan_temporal_dataset: '扫描时序数据集',
        collect_temporal_sources: '收集时序源',
        collect_train_temporal_sources: '收集训练时序源',
        collect_val_temporal_sources: '收集验证时序源',
        expand_temporal_sources: '生成时序片段',
        extract_video_clips: '提取视频片段',
        build_temporal_dataloader: '构建时序数据加载器',
        dataset_ready: '数据集准备完成',
        temporal_dataset_ready: '时序数据准备完成',
        sequence_dataset_ready: '视频片段准备完成'
    };
    return mapping[stage] || stage || '数据准备中';
}

function formatTrainingPreprocessingUnit(unit) {
    const mapping = {
        frames: '帧',
        clips: '片段',
        samples: '样本',
        sources: '数据源',
        phase: '阶段'
    };
    return mapping[unit] || unit || '';
}

function hasTrainingPreprocessingInfo(job) {
    return Boolean(
        job && (
            job.preprocessing_stage ||
            typeof job.preprocessing_progress === 'number' ||
            typeof job.preprocessing_current === 'number' ||
            typeof job.preprocessing_total === 'number'
        )
    );
}

function getTrainingEpochHint(job, progress, currentEpoch, totalEpochs) {
    const etaSuffix = typeof job?.estimated_time_remaining === 'number' && job.estimated_time_remaining >= 0
        ? ` · 预计剩余 ${formatTrainingEta(job.estimated_time_remaining)}`
        : '';
    if (job.status === 'running' && (currentEpoch === 0 || currentEpoch === '0') && hasTrainingPreprocessingInfo(job)) {
        return `数据集预处理中${etaSuffix}`;
    }
    const normalizedCurrentEpoch = currentEpoch === null || currentEpoch === undefined ? '-' : currentEpoch;
    const normalizedTotalEpochs = totalEpochs === null || totalEpochs === undefined ? (job.parameters?.epochs ?? '-') : totalEpochs;
    return `Epoch ${normalizedCurrentEpoch}/${normalizedTotalEpochs}${etaSuffix}`;
}

function formatTrainingEta(totalSeconds) {
    const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
        return `${hours}小时${minutes}分钟`;
    }
    if (minutes > 0) {
        return `${minutes}分钟${remainingSeconds}秒`;
    }
    return `${remainingSeconds}秒`;
}

function buildTrainingPreprocessingMarkup(job) {
    if (!hasTrainingPreprocessingInfo(job)) {
        return '';
    }

    const stageLabel = formatTrainingPreprocessingStage(job.preprocessing_stage);
    const progress = typeof job.preprocessing_progress === 'number' ? Math.max(0, Math.min(100, job.preprocessing_progress)) : null;
    const unitLabel = formatTrainingPreprocessingUnit(job.preprocessing_unit);
    const countText = (typeof job.preprocessing_current === 'number' && typeof job.preprocessing_total === 'number')
        ? `${job.preprocessing_current}/${job.preprocessing_total}${unitLabel ? ` ${unitLabel}` : ''}`
        : '';

    return `
        <div class="mb-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-3">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <p class="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">数据准备</p>
                    <p class="mt-1 text-sm font-medium text-sky-900">${escapeHtml(stageLabel)}</p>
                    ${countText ? `<p class="mt-1 text-xs text-sky-700">${escapeHtml(countText)}</p>` : ''}
                </div>
                ${progress !== null ? `<span class="text-xs font-semibold text-sky-700">${progress.toFixed(1)}%</span>` : ''}
            </div>
            ${progress !== null ? `
                <div class="mt-3 h-2 w-full rounded-full bg-sky-100">
                    <div class="h-2 rounded-full bg-sky-500 transition-all duration-300" style="width: ${progress}%"></div>
                </div>
            ` : ''}
        </div>
    `;
}

function getLatestTrainingMetric(metricsResponse) {
    const metrics = metricsResponse?.metrics || [];
    return metrics.length ? metrics[metrics.length - 1] : null;
}

function getTrainingCheckpointMinDelta(job, metricsResponse) {
    const candidates = [
        job?.parameters?.early_stopping_min_delta,
        metricsResponse?.early_stopping_min_delta,
        metricsResponse?.earlyStoppingMinDelta
    ];

    for (const candidate of candidates) {
        const numericCandidate = toFiniteNumber(candidate, null);
        if (numericCandidate !== null) {
            return Math.max(0, numericCandidate);
        }
    }

    return 0.002;
}

function isTrainingCheckpointCandidateBetter(candidateMetric, bestMetric, minDelta) {
    if (!candidateMetric) return false;
    if (!bestMetric) return true;

    const candidateSelectionScore = toFiniteNumber(candidateMetric.checkpoint_selection_score, -Infinity);
    const bestSelectionScore = toFiniteNumber(bestMetric.checkpoint_selection_score, -Infinity);
    if (bestSelectionScore < 0) {
        return true;
    }
    if (candidateSelectionScore > bestSelectionScore + minDelta) {
        return true;
    }

    const scoreGap = Math.abs(candidateSelectionScore - bestSelectionScore);
    const candidateValAccuracy = toFiniteNumber(candidateMetric.val_accuracy, -Infinity);
    const bestValAccuracy = toFiniteNumber(bestMetric.val_accuracy, -Infinity);
    if (scoreGap <= minDelta && candidateValAccuracy > bestValAccuracy + minDelta) {
        return true;
    }

    const accuracyGap = Math.abs(candidateValAccuracy - bestValAccuracy);
    const candidateValLoss = toFiniteNumber(candidateMetric.val_loss, null);
    if (accuracyGap <= minDelta && candidateValLoss !== null) {
        const bestValLoss = toFiniteNumber(bestMetric.val_loss, null);
        if (bestValLoss === null) {
            return true;
        }
        const lossDelta = Math.max(minDelta * 0.1, 1e-5);
        return candidateValLoss < bestValLoss - lossDelta;
    }

    return false;
}

function selectBestTrainingMetric(metrics, minDelta) {
    const metricPoints = Array.isArray(metrics) ? metrics : [];
    return metricPoints.reduce((bestMetric, point) => {
        return isTrainingCheckpointCandidateBetter(point, bestMetric, minDelta)
            ? point
            : bestMetric;
    }, null);
}

function getTrainingBestCheckpointSummary(job, metricsResponse) {
    const metrics = Array.isArray(metricsResponse?.metrics) ? metricsResponse.metrics : [];
    const recordedBestEpoch = toFiniteNumber(job?.results?.best_epoch, null);
    const minDelta = getTrainingCheckpointMinDelta(job, metricsResponse);

    let bestMetric = recordedBestEpoch === null
        ? null
        : metrics.find(point => toFiniteNumber(point?.epoch, null) === recordedBestEpoch) || null;

    let selectionSource = bestMetric ? 'backend_recorded_best_epoch' : 'job_results';

    if (!bestMetric && metrics.length) {
        bestMetric = selectBestTrainingMetric(metrics, minDelta);
        if (bestMetric) {
            selectionSource = 'frontend_tolerance_mirror';
        }
    }

    return {
        metric: bestMetric,
        bestEpoch: bestMetric?.epoch ?? (recordedBestEpoch ?? job?.results?.best_epoch ?? null),
        selectionScore: bestMetric?.checkpoint_selection_score ?? job?.results?.checkpoint_selection_score ?? null,
        valAccuracy: bestMetric?.val_accuracy ?? job?.results?.val_accuracy ?? null,
        valLoss: bestMetric?.val_loss ?? job?.results?.val_loss ?? null,
        valSampleAccuracy: bestMetric?.val_sample_accuracy ?? job?.results?.val_sample_accuracy ?? null,
        valSampleLoss: bestMetric?.val_sample_loss ?? job?.results?.val_sample_loss ?? null,
        selectionSource,
        minDelta
    };
}

function getBestValidationMetric(metricsResponse, options = {}) {
    return getTrainingBestCheckpointSummary(options.job, metricsResponse).metric;
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
        yolo: 'YOLO',
        resnet: 'ResNet'
    };
    return mapping[value] || value.toUpperCase();
}

function formatHistoryModelLabel(record) {
    if (!record) return '-';
    if (record.model_name && record.model_name !== 'Built-in Model') {
        return record.model_type ? `${record.model_name} (${formatModelLabel(record.model_type)})` : record.model_name;
    }
    if (record.model_type) {
        return formatModelLabel(record.model_type);
    }
    return record.model_name || '-';
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

function getHistoryOutcome(record) {
    if (
        record?.status === 'failed'
        || record?.prediction === 'failed'
        || record?.prediction === null
        || record?.prediction === undefined
    ) {
        return {
            text: '失败',
            className: 'error',
            badgeClass: 'bg-amber-100 text-amber-800',
            isFailed: true
        };
    }
    if (record.prediction === 'real') {
        return {
            text: '真实',
            className: 'real',
            badgeClass: 'bg-green-100 text-green-800',
            isFailed: false
        };
    }
    return {
        text: '伪造',
        className: 'fake',
        badgeClass: 'bg-red-100 text-red-800',
        isFailed: false
    };
}

// 统计功能
async function loadStatistics() {
    try {
        const response = await axios.get(`${API_BASE_URL}/detection/statistics`);
        const stats = response.data;
        const failedCountEl = document.getElementById('failedCount');

        document.getElementById('totalDetections').textContent = stats.total_detections.toLocaleString();
        document.getElementById('realCount').textContent = stats.real_detections.toLocaleString();
        document.getElementById('fakeCount').textContent = stats.fake_detections.toLocaleString();
        if (failedCountEl) {
            failedCountEl.textContent = stats.failed_detections.toLocaleString();
        }
        document.getElementById('accuracy').textContent = formatAccuracy(stats.average_confidence);

        loadTrendChart(stats.daily_detections || {});
    } catch (error) {
        const failedCountEl = document.getElementById('failedCount');
        if (failedCountEl) {
            failedCountEl.textContent = '-';
        }
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
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail) {
        return detail;
    }
    if (detail && typeof detail === 'object') {
        const recordId = detail.record_id ?? detail.recordId;
        const message = detail.message || detail.detail || detail.error_message || detail.errorMessage;
        if (message && recordId !== null && recordId !== undefined) {
            return `${message}（record_id: ${recordId}）`;
        }
        if (message) {
            return message;
        }
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
    if (window.innerWidth < 768 && trainingEpochChart) {
        trainingEpochChart.resize();
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
    const recordId = escapeHtml(String(record.id ?? index ?? ''));
    const historyOutcome = getHistoryOutcome(record);
    const historyVideoMetadataGridItems = buildVideoMetadataItems(record).map(item => `
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">${escapeHtml(item.label)}</label>
                        <p class="text-sm text-gray-900">${escapeHtml(item.value)}</p>
                    </div>
                `).join('');
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
                        <p class="text-sm text-gray-900">${escapeHtml(record.file_name)}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测时间</label>
                        <p class="text-sm text-gray-900">${escapeHtml(formatDateTime(record.created_at))}</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">使用模型</label>
                        <p class="text-sm text-gray-900">${escapeHtml(formatHistoryModelLabel(record))}</p>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">检测结果</label>
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${historyOutcome.badgeClass}">
                            ${historyOutcome.text}
                        </span>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">${getPredictedConfidenceLabel()}</label>
                    <div class="flex items-center space-x-3">
                        <div class="flex-1 bg-gray-200 rounded-full h-2">
                            <div class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full" 
                                 style="width: ${historyOutcome.isFailed ? '0%' : formatInlineWidthPercent(typeof record.confidence === 'number' ? record.confidence * 100 : record.confidence)}"></div>
                        </div>
                        <span class="text-sm font-medium text-gray-900">${escapeHtml(historyOutcome.isFailed ? '-' : formatAccuracy(record.confidence))}</span>
                    </div>
                </div>
                
                ${record.processing_time ? `
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">处理时间</label>
                    <p class="text-sm text-gray-900">${escapeHtml(record.processing_time.toFixed(2))} 秒</p>
                </div>
                ` : ''}
                ${record.file_type === 'video' && historyVideoMetadataGridItems ? `
                <div class="grid grid-cols-2 gap-4">
                    ${historyVideoMetadataGridItems}
                </div>
                ` : ''}
                
                <div class="bg-gray-50 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-gray-900 mb-2">检测分析</h3>
                    <p class="text-sm text-gray-600">
                        ${historyOutcome.isFailed
                            ? '该检测任务未成功完成，因此没有产生可信的真实/伪造结论。请结合错误信息重新提交或排查模型与文件状态。'
                            : record.prediction === 'real' 
                            ? '经过深度学习模型分析，该文件被判定为真实内容，未发现明显的深度伪造痕迹。'
                            : '经过深度学习模型分析，该文件被判定为可能包含深度伪造内容，建议进一步验证。'}
                    </p>
                </div>
                ${record.error_message ? `
                <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-amber-900 mb-2">失败原因</h3>
                    <p class="text-sm text-amber-800">${escapeHtml(record.error_message)}</p>
                </div>
                ` : ''}
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 class="text-sm font-medium text-blue-900 mb-2">
                        <i class="fas fa-info-circle mr-2"></i>技术说明
                    </h3>
                    <p class="text-sm text-blue-800">
                        ${historyOutcome.isFailed
                            ? `本次任务原本计划使用 ${escapeHtml(formatHistoryModelLabel(record))} 模型进行分析，但检测流程未成功完成，因此没有生成可解释的类别概率。`
                            : `本检测结果基于 ${escapeHtml(formatHistoryModelLabel(record))} 模型的当前登记信息进行分析。预测结果置信度表示模型对当前判定类别的概率，具体训练来源与高级指标请以模型详情页中的实际登记信息为准。`}
                    </p>
                </div>
            </div>
            
            <div class="flex justify-end space-x-3 mt-6">
                <button data-record-id="${recordId}" onclick="downloadReport(this.dataset.recordId)" class="px-4 py-2 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors">
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
    
    const report = buildReportDataFromHistoryRecord(record);
    downloadDetectionReportHtml(report, `deepfake_report_${record.file_name}`);
    
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
    return detectionHistoryCache.find(item => String(item.id) === String(recordId));
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
