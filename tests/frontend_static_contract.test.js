const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const frontendRoot = path.resolve(__dirname, '..');
const configSource = fs.readFileSync(path.join(frontendRoot, 'config.js'), 'utf8');
const indexHtmlSource = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
const scriptSource = fs.readFileSync(path.join(frontendRoot, 'script.js'), 'utf8');

function createElement() {
    return {
        innerHTML: '',
        value: '',
        disabled: false,
        textContent: '',
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        addEventListener() {},
        appendChild() {},
        click() {},
        remove() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        }
    };
}

function getOrCreateElement(elements, key) {
    if (!elements.has(key)) {
        elements.set(key, createElement());
    }
    return elements.get(key);
}

function loadFrontend({ location, appConfig } = {}) {
    const elements = new Map();
    const document = {
        addEventListener() {},
        getElementById(id) {
            return getOrCreateElement(elements, id);
        },
        querySelector(selector) {
            return getOrCreateElement(elements, selector);
        },
        querySelectorAll() {
            return [];
        },
        createElement() {
            return createElement();
        },
        body: {
            classList: {
                add() {},
                remove() {}
            },
            appendChild(node) {
                this.lastAppended = node;
            },
            removeChild() {}
        }
    };

    const windowObject = {
        location: location || { protocol: 'http:', hostname: 'localhost' },
        __APP_CONFIG__: appConfig || {},
        addEventListener() {},
        innerWidth: 1440,
        setInterval,
        clearInterval,
        URL: {
            createObjectURL() {
                return 'blob:mock';
            },
            revokeObjectURL() {}
        },
        confirm() {
            return true;
        }
    };

    const context = {
        window: windowObject,
        document,
        console,
        setTimeout,
        clearTimeout,
        Chart: function Chart() {},
        axios: {
            get: async () => ({ data: {} }),
            post: async () => ({ data: {} })
        },
        FormData: class FormData {
            constructor() {
                this.values = [];
            }

            append(key, value) {
                this.values.push([key, value]);
            }
        },
        Blob: class Blob {},
        URL: windowObject.URL,
        navigator: {},
        alert() {},
        confirm() {
            return true;
        }
    };

    context.global = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(configSource, context);
    vm.runInContext(scriptSource, context);
    return { context, elements };
}

function createTrainingDetailModalStub() {
    const body = createElement();
    return {
        innerHTML: '',
        className: '',
        classList: {
            add() {},
            remove() {},
            toggle() {}
        },
        addEventListener() {},
        appendChild() {},
        click() {},
        remove() {},
        querySelector(selector) {
            if (selector === '#trainingDetailBody') {
                return body;
            }
            return null;
        },
        querySelectorAll() {
            return [];
        },
        body
    };
}

async function testUploadAreaEscapesMaliciousFilename() {
    const { context, elements } = loadFrontend();
    const uploadContent = getOrCreateElement(elements, '.upload-content');

    context.updateUploadArea([
        {
            name: '<img src=x onerror=alert(1)>.png',
            type: 'image/png',
            size: 1024
        }
    ]);

    assert(uploadContent.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;.png'));
    assert(!uploadContent.innerHTML.includes('<img src=x onerror=alert(1)>.png'));
}

async function testLoadDetectionModelsRequiresExplicitSelectionWithoutReadyDefault() {
    const { context, elements } = loadFrontend();
    const modelSelect = elements.get('modelSelect') || createElement();
    const modelFilter = elements.get('modelFilter') || createElement();
    const trainingModelType = elements.get('trainingModelType') || createElement();
    elements.set('modelSelect', modelSelect);
    elements.set('modelFilter', modelFilter);
    elements.set('trainingModelType', trainingModelType);
    trainingModelType.value = 'vit';

    context.axios.get = async () => ({
        data: {
            models: [
                {
                    id: null,
                    name: 'vit',
                    label: '<b>builtin vit</b>',
                    model_type: 'vit',
                    source: 'builtin',
                    is_default: false,
                    is_ready: false,
                    is_recommended: false,
                    usable_for: ['image', 'video']
                }
            ],
            default: {
                model_id: null,
                model_type: null,
                source: null,
                is_ready: false,
                selection_policy: 'explicit_ready_model_required'
            },
            model_types: ['vit', 'yolo']
        }
    });

    await context.loadDetectionModels();

    assert(modelSelect.innerHTML.startsWith('<option value="" selected>请选择可用模型</option>'));
    assert(modelSelect.innerHTML.includes('&lt;b&gt;builtin vit&lt;/b&gt;'));
    assert.strictEqual(modelSelect.value, '');
    assert(trainingModelType.innerHTML.includes('<option value="">选择模型类型</option>'));
    assert(trainingModelType.innerHTML.includes('<option value="vit">Vision Transformer</option>'));
    assert(trainingModelType.innerHTML.includes('<option value="yolo">YOLO</option>'));
    assert.strictEqual(trainingModelType.value, 'vit');
}

async function testTrainingModelTypeSelectMarkupUsesPlaceholderOnly() {
    const trainingModelTypeSelectMarkup = indexHtmlSource.match(/<select id="trainingModelType"[\s\S]*?<\/select>/);

    assert(trainingModelTypeSelectMarkup);
    assert(trainingModelTypeSelectMarkup[0].includes('<option value="">选择模型类型</option>'));
    assert(!trainingModelTypeSelectMarkup[0].includes('<option value="vgg">'));
}

async function testLoadDetectionModelsClearsUnsupportedTrainingModelSelection() {
    const { context, elements } = loadFrontend();
    const trainingModelType = elements.get('trainingModelType') || createElement();
    elements.set('trainingModelType', trainingModelType);
    trainingModelType.value = 'resnet';

    context.axios.get = async () => ({
        data: {
            models: [],
            default: {
                model_id: null,
                model_type: null,
                source: null,
                is_ready: false,
                selection_policy: 'explicit_ready_model_required'
            },
            model_types: ['vit', 'yolo']
        }
    });

    await context.loadDetectionModels();

    assert.strictEqual(trainingModelType.value, '');
    assert(trainingModelType.innerHTML.includes('<option value="yolo">YOLO</option>'));
}

async function testFormatModelLabelUsesYoloDisplayName() {
    const { context } = loadFrontend();

    assert.strictEqual(context.formatModelLabel('yolo'), 'YOLO');
    assert.strictEqual(
        context.formatHistoryModelLabel({ model_name: 'Built-in Model', model_type: 'yolo' }),
        'YOLO'
    );
}

async function testTrainingEpochHintIncludesEtaWhenAvailable() {
    const { context } = loadFrontend();

    assert.strictEqual(
        context.getTrainingEpochHint(
            {
                status: 'running',
                estimated_time_remaining: 125,
                parameters: { epochs: 10 }
            },
            50,
            3,
            10
        ),
        'Epoch 3/10 · 预计剩余 2分钟5秒'
    );

    assert.strictEqual(
        context.getTrainingEpochHint(
            {
                status: 'running',
                estimated_time_remaining: 3720,
                preprocessing_stage: 'scan_dataset',
                preprocessing_progress: 15,
                parameters: { epochs: 10 }
            },
            10,
            0,
            10
        ),
        '数据集预处理中 · 预计剩余 1小时2分钟'
    );
}

async function testResolveApiBaseUrlHonorsExplicitAndComposedConfig() {
    const explicit = loadFrontend({
        location: { protocol: 'https:', hostname: 'frontend.example.com' },
        appConfig: { API_BASE_URL: 'https://api.example.com/custom/' }
    }).context;

    assert.strictEqual(explicit.resolveApiBaseUrl(), 'https://api.example.com/custom');

    const composed = loadFrontend({
        location: { protocol: 'file:', hostname: '' },
        appConfig: {
            API_SCHEME: 'https:',
            API_HOST: 'api.local',
            API_PORT: '9443',
            API_V1_STR: '',
            API_V1_PREFIX: 'v2'
        }
    }).context;

    assert.strictEqual(composed.resolveApiBaseUrl(), 'https://api.local:9443/v2');
}

async function testStructuredApiErrorMessageUsesMessageAndRecordId() {
    const { context } = loadFrontend();

    assert.strictEqual(
        context.getApiErrorMessage({
            response: {
                data: {
                    detail: {
                        message: 'No usable model',
                        record_id: 42
                    }
                }
            }
        }),
        'No usable model（record_id: 42）'
    );
}

async function testDisplayResultsEscapesFilenameAndModel() {
    const { context, elements } = loadFrontend();
    const resultsContainer = getOrCreateElement(elements, 'resultsContainer');

    context.displayResults([
        {
            filename: '<svg/onload=alert(1)>.png',
            model: '<b>bad-model</b>',
            result: 'fake',
            confidence: '98.0',
            processingTime: '0.12',
            decisionMetrics: null
        }
    ]);

    assert(resultsContainer.innerHTML.includes('&lt;svg/onload=alert(1)&gt;.png'));
    assert(resultsContainer.innerHTML.includes('&lt;b&gt;bad-model&lt;/b&gt;'));
    assert(!resultsContainer.innerHTML.includes('<svg/onload=alert(1)>.png'));
    assert(!resultsContainer.innerHTML.includes('<b>bad-model</b>'));
}

async function testLoadHistoryEscapesHistoryRows() {
    const { context, elements } = loadFrontend();
    getOrCreateElement(elements, 'historyTableBody');
    getOrCreateElement(elements, 'historyFilter').value = '';
    getOrCreateElement(elements, 'modelFilter').value = '';
    getOrCreateElement(elements, 'historyFilterSummary');

    context.axios.get = async () => ({
        data: {
            detections: [
                {
                    id: 5,
                    created_at: '2026-03-30T12:00:00Z',
                    file_name: '<img src=x onerror=alert(1)>.png',
                    model_name: '<b>bad-model</b>',
                    model_type: 'vit',
                    file_type: 'image',
                    prediction: 'fake',
                    confidence: 0.91,
                    status: 'completed'
                }
            ]
        }
    });

    await context.loadHistory();

    const tbody = elements.get('historyTableBody');
    assert(tbody.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;.png'));
    assert(tbody.innerHTML.includes('&lt;b&gt;bad-model&lt;/b&gt;'));
    assert(!tbody.innerHTML.includes('<img src=x onerror=alert(1)>.png'));
}

async function testViewHistoryDetailEscapesAndShowsVideoMetadata() {
    const { context, elements } = loadFrontend();
    getOrCreateElement(elements, 'historyTableBody');
    getOrCreateElement(elements, 'historyFilter').value = '';
    getOrCreateElement(elements, 'modelFilter').value = '';
    getOrCreateElement(elements, 'historyFilterSummary');

    context.axios.get = async () => ({
        data: {
            detections: [
                {
                    id: 7,
                    created_at: '2026-03-30T12:00:00Z',
                    file_name: '<video>.mp4',
                    model_name: 'No model loaded',
                    model_type: null,
                    file_type: 'video',
                    prediction: null,
                    confidence: null,
                    status: 'failed',
                    error_message: '<script>alert(1)</script>',
                    source_total_frames: 300,
                    source_fps: 30,
                    source_duration_seconds: 10,
                    sampled_frame_count: 24,
                    analyzed_frame_count: 12,
                    sampled_duration_seconds: 4
                }
            ]
        }
    });

    await context.loadHistory();
    context.viewHistoryDetail('7');

    const modal = context.document.body.lastAppended;
    assert(modal.innerHTML.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert(modal.innerHTML.includes('源视频总帧数'));
    assert(modal.innerHTML.includes('采样帧数'));
    assert(!modal.innerHTML.includes('<script>alert(1)</script>'));
}

async function testRenderDetectionReportHtmlEscapesReportFields() {
    const { context } = loadFrontend();
    const html = context.renderDetectionReportHtml({
        title: 'Deepfake 检测报告',
        fileName: '<img>.png',
        fileType: '图片',
        detectedAt: '2026-03-30 12:00:00',
        modelName: '<b>bad-model</b>',
        predictionText: '伪造',
        predictionClass: 'fake',
        confidenceLabel: '预测结果置信度',
        confidenceText: '91.0%',
        confidenceValue: 0.91,
        processingTimeText: '0.12 秒',
        videoMetadataItems: [],
        errorMessage: '<script>alert(1)</script>',
        probabilities: { '<svg>': 0.91 },
        decisionMetrics: null,
        generatedAt: '2026-03-30 12:00:00'
    });

    assert(html.includes('&lt;img&gt;.png'));
    assert(html.includes('&lt;b&gt;bad-model&lt;/b&gt;'));
    assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert(html.includes('&lt;svg&gt;'));
    assert(!html.includes('<script>alert(1)</script>'));
}

async function testPerformDetectionFailureRefreshesHistoryAndStats() {
    const { context, elements } = loadFrontend();
    getOrCreateElement(elements, 'modelSelect').value = '';
    getOrCreateElement(elements, 'resultsContainer');
    getOrCreateElement(elements, 'resultsSection');
    getOrCreateElement(elements, 'loadingOverlay');

    let historyCalls = 0;
    let statsCalls = 0;
    let statisticsCalls = 0;
    let notificationMessage = null;

    context.loadHistory = async () => {
        historyCalls += 1;
    };
    context.loadDetectionStats = async () => {
        statsCalls += 1;
    };
    context.loadStatistics = async () => {
        statisticsCalls += 1;
    };
    context.showNotification = (message) => {
        notificationMessage = message;
    };
    context.runDetectionRequest = async () => {
        throw {
            response: {
                data: {
                    detail: {
                        message: 'No usable model',
                        record_id: 88
                    }
                }
            }
        };
    };

    vm.runInContext(
        "uploadedFiles = [{ name: 'sample.png', type: 'image/png', size: 1024 }];",
        context
    );

    await context.performDetection();

    assert.strictEqual(historyCalls, 1);
    assert.strictEqual(statsCalls, 1);
    assert.strictEqual(statisticsCalls, 1);
    assert.strictEqual(notificationMessage, '检测失败：No usable model（record_id: 88）');
}

async function testHistoryDetailDescriptionAvoidsUnsupportedAccuracyClaims() {
    const { context, elements } = loadFrontend();
    getOrCreateElement(elements, 'historyTableBody');
    getOrCreateElement(elements, 'historyFilter').value = '';
    getOrCreateElement(elements, 'modelFilter').value = '';
    getOrCreateElement(elements, 'historyFilterSummary');

    context.axios.get = async () => ({
        data: {
            detections: [
                {
                    id: 9,
                    created_at: '2026-03-30T12:00:00Z',
                    file_name: 'sample.png',
                    model_name: 'registry-vit',
                    model_type: 'vit',
                    file_type: 'image',
                    prediction: 'real',
                    confidence: 0.82,
                    status: 'completed',
                    error_message: null
                }
            ]
        }
    });

    await context.loadHistory();
    context.viewHistoryDetail('9');

    const modal = context.document.body.lastAppended;
    assert(!modal.innerHTML.includes('多个公开数据集'));
    assert(!modal.innerHTML.includes('较高的准确率'));
    assert(modal.innerHTML.includes('当前登记信息'));
}

async function testPlainTextDetectionReportUsesSanitizedFilename() {
    const { context, elements } = loadFrontend();
    const anchor = createElement();
    context.document.createElement = () => anchor;

    vm.runInContext(
        `detectionResultCache = [{
            id: 1,
            filename: '<bad name>.png',
            model: 'registry-vit',
            result: 'fake',
            confidence: '91.0',
            processingTime: '0.12',
            createdAt: '2026-03-30T12:00:00Z',
            decisionMetrics: null,
            errorMessage: ''
        }];`,
        context
    );

    context.downloadDetectionResultReport(0);

    assert(anchor.download.startsWith('deepfake_result_bad_name_'));
    assert(!anchor.download.includes('<'));
    assert(!anchor.download.includes(' '));
}

async function testTrainingBestCheckpointSummaryMirrorsToleranceAwareSelection() {
    const { context } = loadFrontend();
    const summary = context.getTrainingBestCheckpointSummary(
        {
            parameters: { early_stopping_min_delta: 0.002 },
            results: {}
        },
        {
            metrics: [
                {
                    epoch: 1,
                    checkpoint_selection_score: 0.8,
                    val_accuracy: 0.9,
                    val_loss: 0.3,
                    val_sample_accuracy: 0.88,
                    val_sample_loss: 0.35
                },
                {
                    epoch: 2,
                    checkpoint_selection_score: 0.801,
                    val_accuracy: 0.9,
                    val_loss: 0.31,
                    val_sample_accuracy: 0.89,
                    val_sample_loss: 0.34
                }
            ]
        }
    );

    assert.strictEqual(summary.bestEpoch, 1);
    assert.strictEqual(summary.metric.epoch, 1);
    assert.strictEqual(summary.selectionSource, 'frontend_tolerance_mirror');
}

async function testTrainingDetailUsesBackendRecordedBestCheckpointParity() {
    const { context } = loadFrontend();
    const modal = createTrainingDetailModalStub();

    context.Chart = function Chart(_canvas, config) {
        this.data = config.data;
        this.options = config.options;
        this.destroy = () => {};
        this.update = () => {};
        this.resize = () => {};
    };
    context.document.createElement = () => modal;

    context.renderTrainingDetailModal(
        {
            id: 17,
            name: 'Parity Review Job',
            model_type: 'vit',
            dataset_path: '/tmp/dataset',
            status: 'completed',
            progress: 100,
            current_epoch: 2,
            total_epochs: 2,
            created_at: '2026-03-31T10:00:00Z',
            started_at: '2026-03-31T10:01:00Z',
            completed_at: '2026-03-31T10:02:00Z',
            parameters: {
                epochs: 2,
                training_device: 'cpu',
                batch_size: 8,
                learning_rate: 0.0005,
                early_stopping_min_delta: 0.002
            },
            results: {
                best_epoch: 1,
                checkpoint_selection_score: 0.8,
                val_accuracy: 0.9,
                val_loss: 0.3,
                val_sample_accuracy: 0.88,
                val_sample_loss: 0.35,
                val_video_count: 12,
                epochs_trained: 2,
                model_path: '/tmp/model.pt'
            }
        },
        {
            available: true,
            completed_epochs: 2,
            total_epochs: 2,
            metrics: [
                {
                    epoch: 1,
                    train_accuracy: 0.86,
                    train_loss: 0.42,
                    val_accuracy: 0.9,
                    val_loss: 0.3,
                    val_sample_accuracy: 0.88,
                    val_sample_loss: 0.35,
                    val_video_count: 12,
                    checkpoint_selection_score: 0.8,
                    recorded_at: '2026-03-31T10:01:00Z'
                },
                {
                    epoch: 2,
                    train_accuracy: 0.87,
                    train_loss: 0.39,
                    val_accuracy: 0.9,
                    val_loss: 0.31,
                    val_sample_accuracy: 0.89,
                    val_sample_loss: 0.34,
                    val_video_count: 12,
                    checkpoint_selection_score: 0.801,
                    recorded_at: '2026-03-31T10:02:00Z'
                }
            ]
        }
    );

    assert(modal.body.innerHTML.includes('最佳 epoch: 1'));
    assert(modal.body.innerHTML.includes('checkpoint selection score: <span class="font-semibold text-slate-900">0.8000</span>'));
}

async function testTrainingDetailStillOpensWhenEpochMetricsFail() {
    const { context } = loadFrontend();
    const modal = createTrainingDetailModalStub();
    let closed = false;
    let notificationMessage = null;

    context.document.createElement = () => modal;
    context.showNotification = (message) => {
        notificationMessage = message;
    };
    context.closeTrainingDetailModal = () => {
        closed = true;
    };
    context.axios.get = async (url) => {
        if (url.endsWith('/training/jobs/5')) {
            return {
                data: {
                    id: 5,
                    name: 'Video Hybrid Job',
                    model_type: 'vit',
                    dataset_path: '/tmp/dataset',
                    status: 'running',
                    progress: 45,
                    current_epoch: 3,
                    total_epochs: 10,
                    created_at: '2026-03-31T10:00:00Z',
                    started_at: '2026-03-31T10:01:00Z',
                    parameters: { epochs: 10, training_device: 'cpu', batch_size: 8, learning_rate: 0.0005 },
                    results: {}
                }
            };
        }
        if (url.endsWith('/training/jobs/5/epoch-metrics')) {
            throw { response: { data: { detail: 'metrics failed' } } };
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    await context.refreshTrainingDetailModal(5);

    assert.strictEqual(closed, false);
    assert.strictEqual(notificationMessage, '训练详情已打开，但训练曲线加载失败：metrics failed');
    assert(modal.body.innerHTML.includes('Video Hybrid Job'));
    assert(modal.body.innerHTML.includes('训练曲线暂时不可用：metrics failed'));
}

async function testTrainingDetailClosesWhenPrimaryRequestFails() {
    const { context } = loadFrontend();
    let closed = false;
    let notificationMessage = null;

    context.showNotification = (message) => {
        notificationMessage = message;
    };
    context.closeTrainingDetailModal = () => {
        closed = true;
    };
    context.axios.get = async (url) => {
        if (url.endsWith('/training/jobs/9')) {
            throw { response: { data: { detail: 'job missing' } } };
        }
        return { data: {} };
    };

    await context.refreshTrainingDetailModal(9);

    assert.strictEqual(closed, true);
    assert.strictEqual(notificationMessage, '获取详情失败：job missing');
}

async function testTrainingDetailSilentRefreshSuppressesMetricsWarning() {
    const { context } = loadFrontend();
    const modal = createTrainingDetailModalStub();
    let notificationMessage = null;

    context.document.createElement = () => modal;
    context.showNotification = (message) => {
        notificationMessage = message;
    };
    context.axios.get = async (url) => {
        if (url.endsWith('/training/jobs/7')) {
            return {
                data: {
                    id: 7,
                    name: 'Silent Refresh Job',
                    model_type: 'vit',
                    dataset_path: '/tmp/dataset',
                    status: 'running',
                    progress: 60,
                    current_epoch: 4,
                    total_epochs: 10,
                    created_at: '2026-03-31T10:00:00Z',
                    started_at: '2026-03-31T10:01:00Z',
                    parameters: { epochs: 10, training_device: 'cpu', batch_size: 8, learning_rate: 0.0005 },
                    results: {}
                }
            };
        }
        if (url.endsWith('/training/jobs/7/epoch-metrics')) {
            throw { response: { data: { detail: 'metrics failed' } } };
        }
        throw new Error(`Unexpected URL: ${url}`);
    };

    await context.refreshTrainingDetailModal(7, { silent: true });

    assert.strictEqual(notificationMessage, null);
    assert(modal.body.innerHTML.includes('Silent Refresh Job'));
}

async function main() {
    await testUploadAreaEscapesMaliciousFilename();
    await testLoadDetectionModelsRequiresExplicitSelectionWithoutReadyDefault();
    await testTrainingModelTypeSelectMarkupUsesPlaceholderOnly();
    await testLoadDetectionModelsClearsUnsupportedTrainingModelSelection();
    await testFormatModelLabelUsesYoloDisplayName();
    await testTrainingEpochHintIncludesEtaWhenAvailable();
    await testResolveApiBaseUrlHonorsExplicitAndComposedConfig();
    await testStructuredApiErrorMessageUsesMessageAndRecordId();
    await testDisplayResultsEscapesFilenameAndModel();
    await testLoadHistoryEscapesHistoryRows();
    await testViewHistoryDetailEscapesAndShowsVideoMetadata();
    await testRenderDetectionReportHtmlEscapesReportFields();
    await testPerformDetectionFailureRefreshesHistoryAndStats();
    await testHistoryDetailDescriptionAvoidsUnsupportedAccuracyClaims();
    await testPlainTextDetectionReportUsesSanitizedFilename();
    await testTrainingBestCheckpointSummaryMirrorsToleranceAwareSelection();
    await testTrainingDetailUsesBackendRecordedBestCheckpointParity();
    await testTrainingDetailStillOpensWhenEpochMetricsFail();
    await testTrainingDetailClosesWhenPrimaryRequestFails();
    await testTrainingDetailSilentRefreshSuppressesMetricsWarning();
    console.log('frontend static contract tests passed');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
