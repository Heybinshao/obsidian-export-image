import React, {
  type FC,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { type App, TFile, TFolder } from 'obsidian';
import L from 'src/L';
import { delay, isMarkdownFile } from 'src/utils';
import { saveMultipleFiles } from 'src/utils/capture';
import { formatAvailable, formatReady } from 'src/settings';
import { groupForPath } from 'src/settingGroups';
import FormItems from '../common/form/FormItems';

const ModalContent: FC<{
  settings: ISettings;
  app: App;
  folder: TFolder;
  close: () => void;
  onSettingsChange?: (settings: ISettings) => void;
}> = ({ settings, app, folder, close, onSettingsChange }) => {
  const [formData, setFormData] = useState<ISettings>(settings);
  const persistedRef = useRef(JSON.stringify(settings));
  const [fileList, setFileList] = useState<TFile[]>([]);
  const [selectFiles, setSelectFiles] = useState<TFile[]>([]);
  const [finished, setFinished] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [formats, setFormats] = useState<FileFormat[]>([...formatAvailable]);
  const hiddenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void formatReady.then(() => setFormats([...formatAvailable]));
  }, []);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  useEffect(() => {
    const serialized = JSON.stringify(formData);
    if (serialized === persistedRef.current) return;

    const timer = window.setTimeout(() => {
      persistedRef.current = serialized;
      onSettingsChange?.(formData);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [formData, onSettingsChange]);

  const exportAll = useCallback(async () => {
    if (running) {
      return;
    }

    setRunning(true);
    onSettingsChange?.(formData);
    await saveMultipleFiles(
      selectFiles,
      formData,
      setFinished,
      app,
      folder.name,
      hiddenRef.current!,
    );
    setRunning(false);
    await delay(80);
    close();
  }, [
    running,
    selectFiles,
    setFinished,
    setRunning,
    formData,
    close,
    folder.name,
  ]);
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
      label: L.setting.recursive(),
      path: 'recursive',
      type: 'boolean',
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
      label: '强制表格换行',
      path: 'tableForceWrap',
      type: 'boolean',
      desc: '关闭时保留主题的表格横向滚动；开启后按导出宽度固定列宽并强制换行。',
    },
    {
      label: L.setting.userInfo.show(),
      path: 'authorInfo.show',
      type: 'boolean',
    },
    {
      label: L.setting.watermark.enable.label(),
      path: 'watermark.enable',
      type: 'boolean',
    },
    {
      label: L.setting.format.title(),
      path: 'format',
      type: 'select',
      options: [
        { value: 'png0', text: 'png(normal)' },
        { value: 'png1', text: 'png(no background)' },
        { value: 'jpg', text: 'jpg' },
        { value: 'webp', text: 'webp' },
        { value: 'pdf', text: 'pdf' },
      ].filter(({ value }) => formats.includes(value as FileFormat)),
    },
  ];
  const groupedFormSchema: FormSchema<ISettings> = formSchema.map(field => ({
    ...field,
    group: groupForPath(field.path),
  }));
  useEffect(() => {
    const fileList: TFile[] = [];
    if (formData.recursive) {
      const recursiveFileList = (folder: TFolder) => {
        folder.children.forEach(child => {
          if (child instanceof TFolder) {
            recursiveFileList(child);
          } else if (child instanceof TFile && isMarkdownFile(child)) {
            fileList.push(child);
          }
        });
      };

      recursiveFileList(folder);
    } else {
      for (const child of folder.children) {
        if (child instanceof TFile && isMarkdownFile(child)) {
          fileList.push(child);
        }
      }
    }

    setFileList(fileList);
  }, [formData.recursive, folder]);

  const selectAll = useCallback(() => {
    if (fileList.length === selectFiles.length) {
      setSelectFiles([]);
    } else {
      setSelectFiles(fileList);
    }
  }, [fileList, selectFiles]);

  useEffect(() => {
    const newSelectFiles = selectFiles.filter(file =>
      fileList.includes(file),
    );
    if (newSelectFiles.length !== selectFiles.length) {
      setSelectFiles(newSelectFiles);
    }
  }, [fileList, selectFiles]);

  return (
    <>
      <div className='export-image-hidden' ref={hiddenRef}></div>
      <div
        className='export-image-preview-root'
        style={{
          pointerEvents: running ? 'none' : 'unset',
          cursor: 'not-allowed',
        }}
      >
        <div className='export-image-preview-main'>
          <div className='export-image-preview-left'>
            <FormItems
              formSchema={groupedFormSchema}
              update={setFormData}
              settings={formData}
              app={app}
            />
          </div>
          <div
            className='export-image-preview-right'
            style={{ maxHeight: 320, overflowY: 'auto' }}
          >
            {fileList.length > 0 ? (
              <div>
                <div className='export-image-preview-file-item export-image-select-all'>
                  <input
                    type='checkbox'
                    checked={selectFiles.length === fileList.length}
                    onChange={selectAll}
                  />
                  <span className='export-image-filename'>{L.selectAll()}</span>
                  <span className='export-image-select-number'>
                    {selectFiles.length}/{fileList.length}
                  </span>
                </div>
                {fileList.map(file => (
                  <div
                    className='export-image-preview-file-item'
                    key={file.path}
                  >
                    <input
                      type='checkbox'
                      checked={selectFiles.includes(file)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectFiles([...selectFiles, file]);
                        } else {
                          setSelectFiles(selectFiles.filter(f => f !== file));
                        }
                      }}
                    />
                    <span className='export-image-filename' title={file.path}>
                      {file.path}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div>{L.noMarkdownFile()}</div>
            )}
          </div>
        </div>
        <div
          className='export-image-preview-actions'
          style={{ justifyContent: 'space-around' }}
        >
          <div className='export-image-progress-bar' style={{ width: '40%' }}>
            <div
              className='export-image-progress-bar-inner'
              style={{
                width: `${selectFiles.length > 0 ? 100 * (finished / selectFiles.length) : 0
                  }%`,
              }}
            ></div>
          </div>
          <button disabled={selectFiles.length === 0} onClick={exportAll}>
            {L.exportAll()}
          </button>
        </div>
      </div>
    </>
  );
};

export default ModalContent;
