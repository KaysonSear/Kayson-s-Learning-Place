import { useRef, useState } from 'react';
import { Button } from './ui.tsx';
import type { Progress } from './types.ts';

export function SettingsDialog({progress, restore, edit, replace, download, close}: {
  progress: Progress; restore: (raw: unknown) => Progress; edit: (change: (next: Progress) => void) => void;
  replace: (next: Progress) => void; download: () => void; close: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const importSequence = useRef(0);
  const [candidate, setCandidate] = useState<Progress | null>(null);
  const [error, setError] = useState('');

  async function read(file: File | undefined) {
    const sequence = ++importSequence.current;
    setCandidate(null);
    setError('');
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw Error('文件超过 25 MB，请选择导出的进度 JSON。');
      const result = restore(JSON.parse(await file.text()));
      if (sequence === importSequence.current) setCandidate(result);
    } catch (problem) {
      if (sequence === importSequence.current) setError(problem instanceof SyntaxError ? '文件不是有效的 JSON 进度文件。' : problem instanceof Error ? problem.message : '无法读取进度文件。');
    }
  }

  return <dialog id="settings-dialog" aria-labelledby="settings-title" ref={element => {
    if (element && !element.open) element.showModal();
  }} onClose={close} onCancel={event => {event.preventDefault(); close();}}>
    <div className="dialog-header"><h2 id="settings-title">按你的节奏</h2><button type="button" className="icon-button" data-action="close-settings" aria-label="关闭设置" onClick={close}>×</button></div>
    <div id="settings-content">
      <p className="setting-copy">默认没有声音、倒计时和自动播放。你的学习进度保存在当前浏览器中。</p>
      <div className="setting-row"><label htmlFor="reduce-motion">减少动态效果<small>保留必要的状态反馈。</small></label><input id="reduce-motion" type="checkbox" checked={progress.settings.reduceMotion} onChange={event => {
        const checked = event.target.checked; edit(next => {next.settings.reduceMotion = checked;});
      }} /></div>
      <div className="setting-row"><label htmlFor="text-size">文字大小<small>代码区域可以独立滚动。</small></label><select id="text-size" value={progress.settings.textSize} onChange={event => {
        const value = Number(event.target.value); edit(next => {next.settings.textSize = value;});
      }}><option value="1">标准</option><option value="1.1">稍大</option><option value="1.2">更大</option></select></div>
      <section className="setting-backup"><h3>备份与跨设备迁移</h3><p className="setting-copy">本地 HTML 在不同浏览器、不同文件路径下的存储可能不同。定期导出进度文件；导入会替换本机当前进度，建议先导出备份。</p>
        <div className="button-row"><Button className="primary" data-action="export" onClick={download}>导出进度文件</Button><Button id="import-open" onClick={() => input.current?.click()}>选择进度文件</Button></div>
        <input ref={input} id="import-file" type="file" accept=".json,application/json" hidden onChange={event => void read(event.target.files?.[0])} />
        <div id="import-preview">{candidate && <>
          <p className="setting-copy" style={{marginTop:16}}>文件包含 {Object.keys(candidate.points).length} 个已练知识点、{candidate.history.length} 条作答记录。确认后替换本机进度。</p>
          <div className="button-row" style={{marginTop:12}}><Button className="primary" id="confirm-import" onClick={() => replace(candidate)}>确认导入并替换</Button><button type="button" className="text-button" id="cancel-import" onClick={() => {
            setCandidate(null);
            if (input.current) input.current.value = '';
          }}>取消</button></div>
        </>}</div>
        <p id="import-error" className="import-error" role="alert">{error}</p>
      </section>
      <section className="setting-backup"><h3>离线文件怎么用</h3><p className="setting-copy">Windows：直接用浏览器打开 C-Lab.html。安卓：将文件保存到设备，再用支持本地 HTML 的浏览器打开；文件管理器的静态预览可能不执行脚本。这个网页无需安装，也不需要联网。参考资料链接仅在你主动点击时访问网络。</p></section>
    </div>
  </dialog>;
}
