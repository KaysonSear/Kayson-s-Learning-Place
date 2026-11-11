(async function () {
  const inline = document.getElementById('library-data');
  try {
    if (inline) {
      window.CLabStart(JSON.parse(inline.textContent));
      return;
    }

    const response = await fetch('./library.json');
    if (!response.ok) throw new Error(`Course request failed (${response.status})`);
    window.CLabStart(await response.json());
  } catch (error) {
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '课程数据加载失败。请刷新页面，或重新构建离线文件。';
    document.getElementById('main').replaceChildren(message);
    console.error(error);
  }
})();
