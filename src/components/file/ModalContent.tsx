import { type App, type FrontMatterCache, Notice } from 'obsidian';
import React, {
  useState, useRef, type FC, useEffect, useLayoutEffect, useCallback,
} from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { isCopiable } from 'src/imageFormatTester';
import { copy, save, saveAll, ExportCancelledError, sharePendingFiles, discardPendingShare } from '../../utils/capture';
import L from '../../L';
import Target, { type TargetRef } from '../common/Target';
import FormItems from '../common/form/FormItems';
import { groupForPath } from 'src/settingGroups';
import { isMobileApp, isPhoneApp } from 'src/utils/platform';
import { nextFrame } from 'src/utils/renderHost';

const formSchema: FormSchema<ISettings> = [
  {
    label: '导出主题',
    path: 'themeMode',
    type: 'select',
    desc: '跟随主题随 Obsidian 当前外观；浅色 / 深色强制导出图使用固定配色。',
    options: [
      { text: '跟随主题', value: 'follow' },
      { text: '浅色', value: 'light' },
      { text: '深色', value: 'dark' },
    ],
  },
  {
    label: '剔除笔记信息',
    path: 'stripNoteInfo',
    type: 'boolean',
    desc: '开启后不导出文件名与笔记属性。',
  },
  {
    label: L.includingFilename(),
    path: 'showFilename',
    type: 'boolean',
    when: settings => !settings.stripNoteInfo,
  },
  {
    label: L.imageWidth(),
    path: 'width',
    type: 'number',
  },
  {
    path: 'padding.top',
    label: L.setting.padding.top(),
    desc: L.setting.padding.description(),
    type: 'number',
  },
  {
    path: 'padding.right',
    label: L.setting.padding.right(),
    type: 'number',
  },
  {
    path: 'padding.bottom',
    label: L.setting.padding.bottom(),
    type: 'number',
  },
  {
    path: 'padding.left',
    label: L.setting.padding.left(),
    type: 'number',
  },
  {
    label: '强制表格换行',
    path: 'tableForceWrap',
    type: 'boolean',
    desc: '关闭时保留主题的表格横向滚动；开启后按导出宽度固定列宽并强制换行。',
  },
  {
    path: 'split.mode',
    label: L.setting.split.mode.label(),
    desc: L.setting.split.mode.description(),
    type: 'select',
    options: [
      { text: L.setting.split.mode.none(), value: 'none' },
      { text: L.setting.split.mode.fixed(), value: 'fixed' },
      { text: L.setting.split.mode.hr(), value: 'hr' },
      { text: L.setting.split.mode.auto(), value: 'auto' },
    ],
  },
  {
    path: 'resolutionMode',
    label: L.setting.resolutionMode.label(),
    desc: L.setting.resolutionMode.description(),
    type: 'select',
    options: [
      { text: "1x", value: '1x' },
      { text: "2x", value: '2x' },
      { text: "3x", value: '3x' },
      { text: "4x", value: '4x' },
    ],
  },
  {
    path: 'split.height',
    desc: L.setting.split.height.description(),
    label: L.setting.split.height.label(),
    type: 'number',
    when: (settings) => settings.split.mode !== 'none' && settings.split.mode !== 'hr',
  },
  {
    path: 'split.overlap',
    desc: L.setting.split.overlap.description(),
    label: L.setting.split.overlap.label(),
    type: 'number',
    when: (settings) => settings.split.mode === 'fixed',
  },
  {
    label: L.setting.userInfo.show(),
    path: 'authorInfo.show',
    type: 'boolean',
  },
  {
    label: L.setting.userInfo.name(),
    path: 'authorInfo.name',
    type: 'string',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.remark(),
    path: 'authorInfo.remark',
    type: 'string',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.avatar.title(),
    desc: L.setting.userInfo.avatar.description(),
    path: 'authorInfo.avatar',
    type: 'file',
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.align(),
    path: 'authorInfo.align',
    type: 'select',
    options: [
      { text: 'Left', value: 'left' },
      { text: 'Center', value: 'center' },
      { text: 'Right', value: 'right' },
    ],
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.userInfo.position(),
    path: 'authorInfo.position',
    type: 'select',
    options: [
      { text: 'Top', value: 'top' },
      { text: 'Bottom', value: 'bottom' },
    ],
    when: { flag: true, path: 'authorInfo.show' },
  },
  {
    label: L.setting.watermark.enable.label(),
    path: 'watermark.enable',
    type: 'boolean',
  },
  {
    label: L.setting.watermark.type.label(),
    path: 'watermark.type',
    type: 'select',
    options: [
      { text: L.setting.watermark.type.text(), value: 'text' },
      { text: L.setting.watermark.type.image(), value: 'image' },
    ],
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.text.content(),
    path: 'watermark.text.content',
    type: 'string',
    when: settings =>
      settings.watermark.enable && settings.watermark.type === 'text',
  },
  {
    label: L.setting.watermark.image.src.label(),
    path: 'watermark.image.src',
    type: 'file',
    when: settings =>
      settings.watermark.enable && settings.watermark.type === 'image',
  },
  {
    label: L.setting.watermark.opacity(),
    path: 'watermark.opacity',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.rotate(),
    path: 'watermark.rotate',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.width(),
    path: 'watermark.width',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
  {
    label: L.setting.watermark.height(),
    path: 'watermark.height',
    type: 'number',
    when: { flag: true, path: 'watermark.enable' },
  },
];

const ModalContent: FC<{
  markdownEl: Node;
  settings: ISettings;
  frontmatter: FrontMatterCache | undefined;
  title: string;
  app: App;
  metadataMap: Record<string, { type: MetadataType }>;
  onSettingsChange?: (settings: ISettings) => void;
}> = ({ markdownEl, settings, app, frontmatter, title, metadataMap, onSettingsChange }) => {
  const groupedFormSchema: FormSchema<ISettings> = formSchema.map(field => ({
    ...field,
    group: groupForPath(field.path),
  }));
  const [formData, setFormData] = useState<ISettings>(settings);
  const persistedRef = useRef(JSON.stringify(settings));
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const previewOutRef = useRef<HTMLDivElement>(null);
  // The preview pane fills the modal height (the modal is pinned to 85vh), so
  // measure it instead of hard-coding the window chrome offset. The value only
  // changes when the window is resized; the pane itself is flex-sized.
  const [mainHeight, setMainHeight] = useState(
    () => Math.max(320, Math.round(window.innerHeight * 0.85) - 200),
  );
  const root = useRef<TargetRef>(null);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  useEffect(() => () => {
    // Closing the dialog drops the files rendered for a share sheet that was
    // never opened; keeping them alive would leak a multi-megabyte bitmap.
    discardPendingShare();
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(formData);
    if (serialized === persistedRef.current) return;

    const timer = window.setTimeout(() => {
      persistedRef.current = serialized;
      onSettingsChange?.(formData);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [formData, onSettingsChange]);

  useEffect(() => {
    // 当markdownEl准备好时，更新loading状态
    if (markdownEl && markdownEl instanceof HTMLElement && markdownEl.innerHTML && markdownEl.innerHTML.length > 0) {
      // 给一个小延迟确保内容完全加载
      setTimeout(() => {
        setIsLoading(false);
      }, 100);
    }
    
    // 监听内容加载完成事件
    const handleContentLoaded = () => {
      setIsLoading(false);
    };
    
    window.document.addEventListener("export-image-content-loaded", handleContentLoaded);
    
    return () => {
      window.document.removeEventListener("export-image-content-loaded", handleContentLoaded);
    };
  }, [markdownEl]);

  const [processing, setProcessing] = useState(false);
  const [awaitingShare, setAwaitingShare] = useState(false);
  const [allowCopy, setAllowCopy] = useState(true);
  const [rootHeight, setRootHeight] = useState(0);
  const [pages, setPages] = useState(1);
  const [scale, setScale] = useState(1);
  const isPhone = isPhoneApp();
  // Phones get a tab switch instead of stacking the long settings form above
  // the preview; the preview is what the dialog is for, so it opens first.
  const [mobileTab, setMobileTab] = useState<'preview' | 'settings'>('preview');
  const cancelRef = useRef(false);

  // 添加日志检查函数
  useEffect(() => {
    console.log("ModalContent rendered, loading state:", isLoading);
    console.log("markdownEl content:", markdownEl instanceof HTMLElement ? markdownEl.innerHTML.substring(0, 100) + "..." : "Not HTML Element");
  }, [isLoading, markdownEl]);

  // The pane is flex-sized by the modal layout; keep the numeric height used
  // by the pan/zoom viewport in sync with it (and with window resizes).
  useLayoutEffect(() => {
    const out = previewOutRef.current;
    if (!out) return;

    const update = () => {
      const next = Math.round(out.clientHeight);
      if (next <= 0) return;
      setMainHeight(previous => (Math.abs(previous - next) < 1 ? previous : next));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(out);
    return () => observer.disconnect();
  }, []);

  const calculateScale = useCallback(() => {
    if (!root.current?.element || !previewOutRef.current) return 1;
    const contentHeight = root.current.element.clientHeight;
    const contentWidth = root.current.element.clientWidth;
    const previewWidth = previewOutRef.current.clientWidth;
    // Hidden pane (mobile tab) or not laid out yet: keep a sane minimum.
    if (!previewWidth) return 1;

    return Math.min(
      1,
      mainHeight / (contentHeight || 100),
      previewWidth / ((contentWidth || 0) + 2),
    ) / (isPhoneApp() ? 1 : 2);
  }, [mainHeight]);

  useEffect(() => {
    if (!root.current?.element || processing) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (root.current?.element) {
        if (!processing) {
          setRootHeight(root.current.element.clientHeight);
        }
      }
    });
    observer.observe(root.current.element);
    return () => {
      observer.disconnect();
    };
  }, [root.current?.element, processing]);

  const handleSplitChange = useCallback((positions: number[]) => {
    setPages(positions.length + 1);
  }, []);

  useEffect(() => {
    if (formData.split.mode === 'none') {
      setPages(1);
    }
  }, [formData.split.mode]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    isCopiable(formData.format).then(result => {
      setAllowCopy(Boolean(result));
    });
  }, [formData.format]);

  const waitForPreviewLayout = useCallback(async () => {
    // The settings tab hides the preview with `display:none`; the capture
    // needs a laid-out element, so wait until the browser has measured it.
    for (let i = 0; i < 40; i++) {
      if (root.current?.contentElement?.clientWidth) return;
      await nextFrame();
    }
  }, []);

  const handleSave = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    onSettingsChange?.(formData);
    cancelRef.current = false;
    setAwaitingShare(false);
    setProcessing(true);
    try {
      // A hidden pane has no layout, so a capture taken from the settings tab
      // would be 0×0 (or the wrong size). Bring the preview back first.
      if (isPhone && mobileTab !== 'preview') {
        setMobileTab('preview');
        await waitForPreviewLayout();
      }
      const outcome = await save(
        app,
        root.current.contentElement,
        title,
        formData.resolutionMode,
        formData.format,
        isMobileApp(),
        () => cancelRef.current,
      );
      setAwaitingShare(outcome === 'awaiting-share');
    } catch (error) {
      new Notice(error instanceof ExportCancelledError ? '已取消导出' : L.saveFail());
    }
    setProcessing(false);
  }, [root, formData, title, isPhone, mobileTab, waitForPreviewLayout]);
  const handleCopy = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    onSettingsChange?.(formData);
    setProcessing(true);
    try {
      await copy(app, root.current.contentElement, formData.resolutionMode, formData.format);
    } catch {
      new Notice(L.copyFail());
    }

    setProcessing(false);
  }, [root, formData.resolutionMode, formData.format, title, formData.width]);

  const handleSaveAll = useCallback(async () => {
    if ((formData.width || 640) <= 20) {
      new Notice(L.invalidWidth());
      return;
    }
    if (!root.current) return;

    onSettingsChange?.(formData);
    cancelRef.current = false;
    setAwaitingShare(false);
    setProcessing(true);
    try {
      if (isPhone && mobileTab !== 'preview') {
        setMobileTab('preview');
        await waitForPreviewLayout();
      }
      const outcome = await saveAll(
        root.current,
        formData.format,
        formData.resolutionMode,
        formData.split.height,
        formData.split.overlap,
        formData.split.mode,
        app,
        title,
        () => cancelRef.current,
      );
      setAwaitingShare(outcome === 'awaiting-share');
    } catch (error) {
      new Notice(error instanceof ExportCancelledError ? '已取消导出' : L.copyFail());
    }
    setProcessing(false);
  }, [root, formData, app, title, isPhone, mobileTab, waitForPreviewLayout]);

  const handleSharePending = useCallback(async () => {
    // Runs straight from the tap, so the share sheet gets a live activation.
    const outcome = await sharePendingFiles();
    setAwaitingShare(outcome === 'awaiting-share');
  }, []);

  const handleDismissPending = useCallback(() => {
    discardPendingShare();
    setAwaitingShare(false);
  }, []);

  return (
    <div className='export-image-preview-root'>
      {isPhone && (
        <div className='export-image-mobile-tabs'>
          <button
            className={mobileTab === 'preview' ? 'is-active' : ''}
            onClick={() => setMobileTab('preview')}
          >
            预览
          </button>
          <button
            className={mobileTab === 'settings' ? 'is-active' : ''}
            onClick={() => setMobileTab('settings')}
          >
            设置
          </button>
        </div>
      )}
      <div className='export-image-preview-main'>
        <div
          className='export-image-preview-left'
          style={isPhone && mobileTab !== 'settings' ? { display: 'none' } : undefined}
        >
          <FormItems
            formSchema={groupedFormSchema}
            update={setFormData}
            settings={formData}
            app={app}
          />
          {formData.split.mode !== 'none' && formData.split.mode !== 'hr' && <div className='info-text'>
            {L.splitInfo({ rootHeight, splitHeight: formData.split.height, pages })}
          </div>}
          {formData.split.mode === 'hr' && <div className='info-text'>
            {L.splitInfoHr({ rootHeight, pages })}
          </div>}
          <div className='info-text'>{L.moreSetting()}</div>
        </div>
        <div
          className='export-image-preview-right'
          style={isPhone && mobileTab !== 'preview' ? { display: 'none' } : undefined}
        >
          <div
            className='export-image-preview-out'
            ref={previewOutRef}
            style={{
              cursor: isGrabbing ? 'grabbing' : 'grab',
            }}
          >
            {isLoading ? (
              <div className="export-image-loading">
                <div className="export-image-loading-spinner"></div>
                <div className="export-image-loading-text">{L.loading()}</div>
              </div>
            ) : (
              <TransformWrapper
                minScale={calculateScale()}
                maxScale={4}
                pinch={{ step: 20 }}
                doubleClick={{ mode: 'reset' }}
                centerZoomedOut={false}
                onPanning={() => {
                  setIsGrabbing(true);
                }}
                onPanningStop={() => {
                  setIsGrabbing(false);
                }}
                onTransformed={(e) => {
                  setScale(e.state.scale);
                }}
                initialScale={1}
              >
                <TransformComponent
                  wrapperStyle={{
                    width: '100%',
                    height: mainHeight,
                  }}
                  contentStyle={{
                    border: '1px var(--divider-color) solid',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 0 10px 10px rgba(0,0,0,0.15)',
                  }}
                >
                  <Target
                    ref={root}
                    frontmatter={frontmatter}
                    markdownEl={markdownEl}
                    setting={formData}
                    metadataMap={metadataMap}
                    app={app}
                    title={title}
                    scale={scale}
                    isProcessing={processing}
                    onSplitChange={handleSplitChange}
                  ></Target>
                </TransformComponent>
              </TransformWrapper>
            )}
          </div>
          <div className='info-text'>{L.guide()}</div>
        </div>
      </div>
      <div className='export-image-preview-actions'>
        {!isPhone && pages === 1 && (
          <div>
            <button onClick={handleCopy} disabled={processing || !allowCopy || isLoading}>
              {L.copy()}
            </button>
            {allowCopy || <p>{L.notAllowCopy({ format: formData.format.replace(/\d$/, '').toUpperCase() })}</p>}
          </div>
        )}

        <button onClick={() => pages === 1 ? handleSave() : handleSaveAll()} disabled={processing || isLoading}>
          {isMobileApp() ? '分享' : L.save()}
        </button>
      </div>
      {processing && (
        <div className='export-image-exporting'>
          <div className='export-image-loading-spinner' />
          <div className='export-image-exporting-text'>正在导出…</div>
          <button onClick={() => { cancelRef.current = true; }}>取消</button>
        </div>
      )}
      {awaitingShare && !processing && (
        <div className='export-image-exporting'>
          <div className='export-image-exporting-text'>图片已生成</div>
          <button className='mod-cta' onClick={handleSharePending}>分享</button>
          <button onClick={handleDismissPending}>取消</button>
        </div>
      )}
    </div>
  );
};

export default ModalContent;
