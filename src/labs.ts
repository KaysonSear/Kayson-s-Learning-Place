import { Children, createElement as element } from 'react';
import type { ReactNode } from 'react';

// The teaching models have no dependency on the DOM or browser storage.
function button(action: string, label: string, value?: string | number, props?: {className: string; 'aria-label': string}) {
  return element('button', {type:'button', key: action + ':' + (value ?? ''), 'data-lab-action':action, 'data-value':value, ...props}, label);
}
function code(value: string) { return element('pre', {className:'lab-code'}, element('code', null, value)); }
function cells(values: (string | number)[], active: number, labels?: string[]) {
  return element('div', {className:'memory-row'}, values.map((value, i) =>
    element('div', {key:i, className:'memory-cell' + (i === active ? ' active' : '')},
      element('small', null, labels?.[i] ?? '[' + i + ']'), element('strong', null, value))));
}
function controls(children: ReactNode) { return element('div', {className:'lab-controls'}, Children.toArray(children)); }
function group(...nodes: ReactNode[]) { return Children.toArray(nodes); }
function note(text: string) { return element('p', {className:'lab-model'}, text); }
function result(message: string, success = false) { return {message, success}; }

function define<S>(id: string, title: string, chapters: number[], summary: string, goal: string, assumptions: string,
  initial: () => S, view: (state: NoInfer<S>) => ReactNode,
  act: (state: NoInfer<S>, action: string, value?: string) => ReturnType<typeof result>) {
  return {
    id, title, chapters, summary, goal, assumptions,
    start() {
      const state = initial();
      return {state, view: () => view(state), act: (action: string, value?: string) => act(state, action, value)};
    }
  };
}

const parseCases = [
    {text: '42x', prefix: '42', end: 2, answer: 'tail', explain: '已转换 42，但 end 指向 x。数值前缀有效不等于整串验证通过。'},
    {text: ' -17', prefix: '-17', end: 4, answer: 'valid', explain: '允许前导空白；转换消费了全部文本，且结果在 long 范围内。'},
    {text: '99999999999999999999999', prefix: 'LONG_MAX', end: 23, answer: 'range', explain: '数值超出本模型 long 范围。返回 LONG_MAX 并设置 ERANGE；不能只检查 end。'},
    {text: 'x42', prefix: '0', end: 0, answer: 'none', explain: '没有任何转换，end 等于输入起点。返回的 0 不能独自区分有效的零和转换失败。'}
  ];

const sortInitial = () => ({mode: 'sort', data: [{n: 2, tag: 'A'}, {n: 1, tag: 'B'}, {n: 2, tag: 'C'}, {n: 0, tag: 'D'}], pass: 0, index: 0, comparisons: 0, done: false, lo: 0, hi: 5});

const resourcesInitial = () => ({mode: 'heap', phase: 0, live: true, p: 'block', q: 'block', tried: false, blocked: false, listPhase: 0});

const mathInitial = () => ({mode: 'random', index: 0, counts: [0, 0, 0], rejecting: false, roundStage: 0});

export const models = {
  build: define(
    'build',
    '构建与预处理',
    [1, 19],
    '把源文件变成程序，区分编译与链接错误。',
    '按顺序完成四个构建阶段，再定位一个缺失定义的问题。',
    '示意采用常见分阶段工具链；工具链不一定把每一步保存为磁盘文件。宏替换展示的是本例的展开结果。',
    () => ({stage: 0, diagnosed: false}),
    s => { const stages = ['源文件', '预处理后源码', '汇编文本', '目标文件', '可执行程序']; const preview = ['#define TWICE(x) ((x) + (x))\nint main(void) { return TWICE(2); }', 'int main(void) { return ((2) + (2)); }', '示意汇编：把返回值 4 放入返回寄存器', 'main.o：main 的机器代码与链接信息', '程序已具备入口与已解析的引用']; return group(cells(stages, s.stage),
      code(preview[s.stage]),
      (s.stage < 4 ? controls(['预处理', '编译', '汇编', '链接'].map((name, i) => button('stage', name, i))) : group(code('/* main.c */\nint add(int, int);\nint main(void) { return add(1, 2); }\n/* 构建时没有提供 add 的定义 */'),
      controls(group(button('diagnose', '预处理找不到宏', 0),
      button('diagnose', '链接无法解析 add', 1),
      button('diagnose', 'main 的参数不合法', 2)))))); },
    (s, a, v) => {
      if (a === 'stage' && s.stage < 4) {
        if (Number(v) !== s.stage) return result('下一步应是' + ['预处理', '编译', '汇编', '链接'][s.stage] + '。先看当前产物是什么。');
        s.stage++; return result(['', '头文件与宏先展开，函数尚未执行。', '翻译源码，形成示意汇编文本。', '汇编产生目标文件；尚未解决全部跨文件引用。', '链接把引用与定义对上。下面再诊断一个构建问题。'][s.stage]);
      }
      if (a === 'diagnose' && s.stage === 4) {
        if (Number(v) !== 1) return result('声明让编译器知道接口，但没有提供 add 的函数体。失败发生在链接引用与定义时。');
        s.diagnosed = true; return result('✓ 已完成构建路线。声明可通过翻译，实际定义仍需要在链接时提供。', true);
      }
      return result('先完成当前阶段。');
    }),

  types: define(
    'types',
    '类型与数值',
    [2],
    '切换实现模型，观察对象大小和整数转换。',
    '辨认数组元素数、数组总大小，以及无符号转换后的值。',
    '两种假想实现都取 CHAR_BIT=8、sizeof(char)=1；int 分别为 2 或 4 个 C 字节。不能把模型参数当成所有 C 实现的规定。',
    () => ({bytes: 4, stage: 0}),
    s => group(code(`/* 当前模型：sizeof(int) = ${s.bytes} */\nint a[3] = {1, 2, 3};\nunsigned char b = 255;`),
      cells(['int', 'int a[3]', 'char'], -1, [`${s.bytes} 字节`, `${s.bytes * 3} 字节`, '1 个 C 字节']),
      controls(group(button('model', '使用 2 字节 int', 2),
      button('model', '使用 4 字节 int', 4))),
      element("h3", null, ['sizeof a / sizeof a[0] 是多少？', '当前模型下 sizeof a 是多少个 C 字节？', '执行 b = (unsigned char)(b + 1); 后，b 是多少？'][s.stage]),
      controls((s.stage === 0 ? [3, 6, 12] : s.stage === 1 ? [3, 6, 12] : [0, 255, 256]).map(v => button('answer', String(v), v)))),
    (s, a, v) => {
      if (a === 'model') { s.bytes = Number(v) === 2 ? 2 : 4; return result('已切换模型。固定元素数不依赖 int 恰好占几个字节。'); }
      if (a !== 'answer') return result('请选择一个数值。');
      const expected = [3, s.bytes * 3, 0][s.stage];
      if (Number(v) !== expected) return result(['总大小除以一个元素大小，结果是元素个数 3。', '数组有 3 个 int，每个 int 占当前模型指定的字节数。', 'b 先提升为 int，255 + 1 为 256；转回 8 位 unsigned char 时结果按 256 取模。'][s.stage]);
      if (s.stage === 2) return result('✓ 完成。对象大小依赖实现；数组元素个数与无符号转换规则不能混为一谈。', true);
      s.stage++; return result('判断正确。继续下一种观察角度。');
    }),

  expressions: define(
    'expressions',
    '表达式求值',
    [3],
    '把分组、短路和行为边界分开。',
    '单步判断短路表达式，再识别没有确定输出的表达式。',
    '只模拟屏幕中的固定表达式。分组不等于一般操作数求值顺序；未定义行为不生成数值结果。',
    () => ({stage: 0}),
    s => group(code(s.stage < 2 ? 'int i = 0;\nbool ok = (i != 0) && (12 / i > 1);' : 'int i = 1;\nint r = i++ + i++;'),
      (s.stage < 2 ? cells(['i = 0', 'i != 0', '12 / i > 1', 'ok'], s.stage === 0 ? 1 : 2, ['已知对象', s.stage ? '假' : '待判断', '右操作数', '待确定']) : note('提示：括号可以改变分组；这里需要检查的是两个副作用之间是否有要求的先后关系。')),
      controls((s.stage === 0 ? [button('answer', '左侧为真', 0), button('answer', '左侧为假', 1)] : (s.stage === 1 ? [button('answer', '跳过右侧，ok 为假', 1), button('answer', '继续计算 12 / i', 0)] : [button('answer', 'r 必然为 3', 0), button('answer', 'r 必然为 4', 2), button('answer', '未定义行为，不预测 r', 1)])))),
    (s, a, v) => {
      if (a !== 'answer') return result('先判断当前操作。');
      if (Number(v) !== 1) return result(['i 为 0，所以 i != 0 为假。', '&& 左侧为假时右侧不求值。若真的求 12 / 0，会越过语言规则；本模型不会生成那个结果。', '对同一标量对象的两次修改缺少要求的先后关系。这不是选择某个编译器输出即可解决的问题。'][s.stage]);
      if (s.stage === 2) return result('✓ 已区分：短路是确定的求值规则；未定义行为没有可移植的数值输出。', true);
      s.stage++; return result(s.stage === 1 ? '左侧为假。下一步选择实际发生的控制流。' : '右操作数被跳过，因此没有发生除零。现在检查另一段代码。');
    }),

  control: define(
    'control',
    '控制流轨迹',
    [4],
    '看清循环体、continue 和增量的先后。',
    '单步执行循环，最后预测 sum。',
    '只运行固定程序。continue 跳到 for 的增量表达式，再检查循环条件。',
    () => ({i: 0, sum: 0, pc: '条件', trace: [] as string[], done: false}),
    s => group(code('int sum = 0;\nfor (int i = 0; i < 4; ++i) {\n    if (i == 2) continue;\n    sum += i;\n}'),
      cells([s.i, s.sum, s.pc], -1, ['i', 'sum', '下一步']),
      element("p", {className:"lab-trace"}, s.trace.join(' → ') || '尚未执行循环体'),
      (s.done ? group(element("h3", null, "循环结束。最终 sum 是多少？"),
      controls([3, 4, 6].map(v => button('answer', String(v), v)))) : controls(button('step', '执行下一步')))),
    (s, a, v) => {
      if (a === 'answer' && s.done) return Number(v) === 4 ? result('✓ sum 为 0 + 1 + 3 = 4。i == 2 时跳过累加，但仍执行 ++i。', true) : result('记录中 i == 2 的那一轮没有执行 sum += i。请沿轨迹重新累加。');
      if (a !== 'step' || s.done) return result('循环已结束，请判断结果。');
      if (s.pc === '条件') { if (s.i >= 4) { s.done = true; s.pc = '退出'; return result('i < 4 为假，退出循环。'); } s.pc = '检查 continue'; return result('条件为真，进入循环体。'); }
      if (s.pc === '检查 continue') { s.pc = s.i === 2 ? '增量' : '累加'; if (s.i === 2) s.trace.push('i=2：continue'); return result(s.i === 2 ? '遇到 continue：下一步执行增量，不是直接退出循环。' : '没有触发 continue，继续执行累加。'); }
      if (s.pc === '累加') { s.sum += s.i; s.trace.push(`加 ${s.i}`); s.pc = '增量'; return result('完成 sum += i，下一步 ++i。'); }
      s.i++; s.pc = '条件'; return result('完成 ++i，回到条件判断。');
    }),

  calls: define(
    'calls',
    '调用与递归',
    [5, 13],
    '展开独立栈帧，追踪等待的加法。',
    '把 sum(3) 展开到基例，再逐层返回。',
    '调用栈是教学示意，不声称物理栈布局。每个 n 是对应调用自己的参数对象。输入固定为 3，结果在 int 范围内。',
    () => ({stack: [3], returning: false, returned: 0, trace: [] as string[], done: false}),
    s => group(code('int sum(int n) {\n    if (n == 0) return 0;\n    return n + sum(n - 1);\n}\n/* 求 sum(3) */'),
      element('div', {className:'lab-stack'}, s.stack.length ? s.stack.map((n,i) => element('div', {key:i,className:'memory-cell' + (i===s.stack.length-1 ? ' active' : '')}, element('small',null,'帧 ',i+1,'，自己的 n = ',n), element('strong',null,'sum(',n,')'), element('span',null,n ? '等待 '+n+' + 子调用结果' : '基例：返回 0'))) : element('p',null,'所有调用已经返回。')),
      element("p", null, s.trace.join(' → ') || '先展开调用'),
      (s.done ? group(element("h3", null, "初始调用者最终收到多少？"),
      controls([3, 6, 9].map(v => button('answer', String(v), v)))) : controls(button('step', s.returning ? '返回上一层' : '执行下一步')))),
    (s, a, v) => {
      if (a === 'answer' && s.done) return Number(v) === 6 ? result('✓ 返回结果为 6。不同调用的 n 独立存在；下探保留待完成运算，返回时逐层相加。', true) : result('每一层返回自己的 n 加子调用结果：0、1、3、6。');
      if (a !== 'step' || s.done) return result('调用已返回，请预测最终结果。');
      const n = s.stack[s.stack.length - 1];
      if (!s.returning && n > 0) { s.stack.push(n - 1); return result(`sum(${n}) 保留现场，调用 sum(${n - 1})。`); }
      if (!s.returning) { s.returning = true; s.returned = 0; s.stack.pop(); s.trace.push('sum(0) 返回 0'); return result('命中基例。调用不再继续下探。'); }
      s.returned += n; s.stack.pop(); s.trace.push(`sum(${n}) 返回 ${s.returned}`); if (!s.stack.length) s.done = true;
      return result(s.done ? '最外层已经返回。请确认结果。' : '完成这一层待做的加法，再把结果交给上一层。');
    }),

  arrays: define(
    'arrays',
    '数组扫描',
    [6],
    '维护最大值与严格第二大，而不是排序。',
    '扫描 [-3, 4, 4, 1]，为每个元素选择状态更新动作。',
    '输入非空；“严格第二大”必须小于最大值。尚无候选用“无”表示，不能用 0 冒充初值。',
    () => ({data: [-3, 4, 4, 1], index: 0, max: null as number | null, second: null as number | null}),
    s => group(cells(s.data, s.index),
      cells([s.max === null ? '无' : s.max, s.second === null ? '无' : s.second], -1, ['最大值', '严格第二大']),
      (s.index < s.data.length ? group(element("h3", null, "现在读到 ", s.data[s.index], "。选择应采取的动作。"),
      controls(group(button('update', '提升为最大值，旧最大转第二大', 'max'),
      button('update', '只更新严格第二大', 'second'),
      button('update', '跳过当前值', 'skip')))) : group(element("h3", null, "扫描完成：严格第二大是 1。"),
      note('仅需要保存扫描位置、最大值和第二大候选。重复的最大值不创建第二大。')))),
    (s, a, v) => {
      if (a !== 'update' || s.index >= s.data.length) return result('本轮扫描已经结束。可重置后再练。');
      const x = s.data[s.index];
      const wanted = s.max === null || x > s.max ? 'max' : x < s.max && (s.second === null || x > s.second) ? 'second' : 'skip';
      if (v !== wanted) return result(x === s.max ? '当前值等于最大值。“严格”要求更小，因此这次不能把 4 当成第二大。' : '先比较是否超过最大值；否则只在小于最大值且优于第二大候选时更新第二大。');
      if (v === 'max') { s.second = s.max; s.max = x; } else if (v === 'second') s.second = x;
      s.index++;
      return result(s.index === s.data.length ? '✓ 一次扫描完成，最大值 4、严格第二大 1。重复最大值没有污染候选。' : '更新正确。继续处理下一个元素。', s.index === s.data.length);
    }),

  pointers: define(
    'pointers',
    '指针与数组类型',
    [7],
    '让指针移动，区分有效元素和尾后位置。',
    '先读取第三个元素，再移动到尾后位置并检查读取边界。',
    '模型取 sizeof(int)=4；地址只表示同一数组内的相对字节偏移。数组连续性不是物理 RAM 页连续的承诺。尾后指针可形成，不可解引用。',
    () => ({data: [10, 20, 30], index: 0, readThird: false, checkedBoundary: false, constValue: false, detail: ''}),
    s => group(code(`${s.constValue ? 'const int *p' : 'int *p'} = a + ${s.index};\n/* a 的元素数为 3 */`),
      cells([...s.data, '尾后'], s.index, ['a[0]，+0 字节', 'a[1]，+4 字节', 'a[2]，+8 字节', 'a+3，+12 字节']),
      controls(group(button('move', 'p − 1', -1),
      button('move', 'p + 1', 1),
      button('read', '读取 *p'),
      button('write', '执行 (*p)++'),
      button('const', s.constValue ? '改用 int *' : '改用 const int *'))),
      note(`目标进度：${s.readThird ? '✓ 已读取第三个元素' : '尚未读取第三个元素'}；${s.checkedBoundary ? '✓ 已检查尾后边界' : '尚未检查尾后边界'}`),
      element("details", null, element("summary", null, "再看二维数组：int m[2][3]"), controls(['m', 'm + 1', '*m', 'm[1][2]'].map((x, i) => button('inspect', x, i))), element("p", null, s.detail || '选择一个表达式，观察它的类型和步长。'))),
    (s, a, v) => {
      if (a === 'inspect') { s.detail = ['m 是 int[2][3] 数组；在通常表达式中只转换最外层，得到 int (*)[3]，不是 int **。', 'm + 1 的类型是 int (*)[3]；前进一整行，在本模型中跨过 3 × 4 = 12 字节。', '*m 是第一行，类型 int[3]；在通常表达式中再转换为 int *，指向 m[0][0]。', 'm[1][2] 是第二行第三个 int 对象；从数组起点的偏移在本模型中为 (1 × 3 + 2) × 4 = 20 字节。'][Number(v)]; return result(s.detail); }
      if (a === 'const') { s.constValue = !s.constValue; return result(s.constValue ? 'const 限制通过 p 改写目标，不限制让 p 在合法范围内改指向。' : '现在可以通过 p 改写合法元素。'); }
      if (a === 'move') { const next = s.index + (Number(v)); if (next < 0 || next > s.data.length) return result('此运算会形成数组起点之前或尾后位置之后的指针，越过合法范围；模型阻止该动作。'); s.index = next; return result(next === 3 ? '已形成 a + 3：它是合法尾后指针，但不是第四个元素。' : `p 指向 a[${next}]。移动一步跨过一个 int，不是固定一个字节。`); }
      if (a === 'read' || a === 'write') {
        if (s.index === s.data.length) { s.checkedBoundary = true; return result('尾后位置不能解引用。若在 C 程序执行该读取或写入，将是未定义行为；不显示假想值。' + (s.readThird ? ' ✓ 正常读取与边界检查均已完成。' : ''), s.readThird); }
        if (a === 'write' && s.constValue) return result('目标受 const 约束：通过这个指针改写对象违反约束，应诊断；p 本身仍可合法移动。');
        if (a === 'write') { s.data[s.index]++; return result(`a[${s.index}] 已加一。(*p)++ 修改对象，不移动 p。`); }
        if (s.index === 2) s.readThird = true;
        return result(`*p = ${s.data[s.index]}。` + (s.readThird && s.checkedBoundary ? ' ✓ 已完成实验目标。' : ''), s.readThird && s.checkedBoundary);
      }
      return result('选择一个操作。');
    }),

  strings: define(
    'strings',
    '字符串与字节',
    [8],
    '放置终止符，看容量和字符串长度的区别。',
    '保留 CAT，在合适位置放入终止符，再核对 strlen 与 sizeof。',
    '字符数组容量为 5 个 C 字节。strlen 只可用于有效终止的字符串；无终止符时不推测后续内存。',
    () => ({data: ['C', 'A', 'T', '!', '?'], stage: 0}),
    s => group(code("char s[5] = {'C', 'A', 'T', '!', '?'};"),
      element('div', {className:'memory-row'}, s.data.map((v,i) => element('button', {key:i,type:'button',className:'memory-cell' + (v==='\0' ? ' active' : ''),'data-lab-action':'nul','data-value':i,'aria-label':'把第 '+i+' 格设为终止符'},element('small',null,'s[',i,']'),element('strong',null,v==='\0'?'\\0':v),element('span',null,'放置终止符')))),
      (s.stage < 1 ? controls(button('measure', '检查长度')) : group(element("h3", null, "终止符在下标 3，哪一组正确？"),
      controls(group(button('answer', 'strlen = 3，sizeof = 5', 1),
      button('answer', 'strlen = 4，sizeof = 4', 0),
      button('answer', 'strlen = 5，sizeof = 5', 2)))))),
    (s, a, v) => {
      if (a === 'nul') { s.data[Number(v)] = '\0'; s.stage = 0; return result('已写入终止符。长度从数组起点数到第一个终止符之前。'); }
      if (a === 'measure') { const n = s.data.indexOf('\0'); if (n < 0) return result('数组中没有终止符，不能把它作为字符串交给 strlen。继续越界读取属于未定义行为；模型不提供长度。'); if (n !== 3 || s.data.slice(0, 3).join('') !== 'CAT') return result(`第一个终止符位于下标 ${n}。目标是保留完整的 CAT；可以重置后重新放置。`); s.stage = 1; return result('CAT 后面有终止符了。现在分别判断内容长度和数组容量。'); }
      if (a === 'answer' && s.stage === 1) return Number(v) === 1 ? result('✓ strlen 不包含终止符；sizeof 仍是整个数组的 5 个 C 字节。', true) : result('终止符结束字符序列，但不会把已建立的数组缩小。');
      return result('先放置终止符，再检查。');
    }),

  formats: define(
    'formats',
    '格式化输入输出',
    [9],
    '追踪扫描宽度、缓冲区和消费位置。',
    '为 4 字节数组选择安全宽度，读取单词，再判断后续整数扫描。',
    '输入固定为 ASCII 文本 hello 42。%s 的宽度限制匹配字符数，额外还需要终止符位置；本例不涉及多字节编码。',
    () => ({stage: 0, position: 0, buffer: ['', '', '', ''], intChecked: false}),
    s => group(code('char word[4];\nint number;\n/* 输入：hello 42 */\nscanf("%3s", word);\nscanf("%d", &number);'),
      cells('hello 42'.split(''), s.position, 'hello 42'.split('').map((_, i) => `输入[${i}]`)),
      cells(s.buffer.map(x => x === '\0' ? '\\0' : x || '空'), -1, ['word[0]', 'word[1]', 'word[2]', 'word[3]']),
      (s.stage === 0 ? group(element("h3", null, "word 容量为 4，哪一种最适合这次安全读取？"),
      controls(group(button('width', '%3s', 3),
      button('width', '%4s', 4),
      button('width', '%s（不设宽度）', 0)))) : (s.stage === 1 ? controls(button('step', '消费下一个字符')) : group(element("h3", null, "下一个未读字符是 l。scanf(\"%d\", &number) 返回什么？"),
      controls(group(button('answer', '1，写入一个整数', 1),
      button('answer', '0，匹配失败', 0),
      button('answer', 'EOF，因为文件结束', -1))))))),
    (s, a, v) => {
      if (a === 'width' && s.stage === 0) { if (Number(v) !== 3) return result('hello 比数组容量长。需要最多读取 3 个字符，给附加的终止符留 1 格；%4s 在本输入会写出界。'); s.stage = 1; return result('已采用 %3s。单步观察输入如何被消费。'); }
      if (a === 'step' && s.stage === 1) { if (s.position < 3) { s.buffer[s.position] = 'hello 42'[s.position]; s.position++; if (s.position === 3) { s.buffer[3] = '\0'; s.stage = 2; return result('读到宽度上限，补写终止符；第一个 scanf 返回 1。lo 42 仍在输入中。'); } return result('已消费一个匹配字符。'); } }
      if (a === 'answer' && s.stage === 2) { if (Number(v) !== 0) return result('l 不能作为十进制整数的开头。没有成功赋值，也没有到达输入结束，因此返回 0；number 没有被这次扫描写入。'); s.intChecked = true; return result('✓ 返回 0；l 仍未被消费。后续不能把未经有效赋值的 number 当成新读入结果。', true); }
      return result('先完成当前扫描步骤。');
    }),

  parse: define(
    'parse',
    '文本解析与诊断',
    [10],
    '结合结束指针、范围和返回值判断输入。',
    '为四种输入选择正确诊断。',
    '固定使用 strtol(text, &end, 10)，调用前 errno=0；模型 long 为 32 位，范围 −2147483648…2147483647。输入无内部空字符。',
    () => ({index: 0, solved: 0}),
    s => { const c = parseCases[s.index]; return group(code(`errno = 0;\nchar *end;\nlong value = strtol("${c.text}", &end, 10);\n/* 再检查 end 和 errno */`),
      cells(c.text.split(''), -1),
      element("p", null, "案例 ", s.index + 1, " / ", parseCases.length, "：完整业务输入应当是一个范围内的十进制整数。"),
      controls(group(button('classify', '整串有效', 'valid'),
      button('classify', '有数值，但尾部残留', 'tail'),
      button('classify', '没有发生转换', 'none'),
      button('classify', '超出 long 范围', 'range')))); },
    (s, a, v) => {
      if (a !== 'classify') return result('选择一种诊断。');
      const c = parseCases[s.index]; if (v !== c.answer) return result('检查顺序：是否发生转换 → 是否越界 → 尾部是否满足业务要求。此例：' + c.explain);
      s.solved++; const message = `返回 ${c.prefix}，end 偏移 ${c.end}。${c.explain}`;
      if (s.index === parseCases.length - 1) return result('✓ 四类输入均已辨清。' + message, true);
      s.index++; return result(message + ' 继续下一个案例。');
    }),

  bits: define(
    'bits',
    '位运算',
    [11],
    '用掩码操作目标位，保留其他位。',
    '把 bit 5 清零、bit 0 置一，其他位不变。起始值为 10101100。',
    '显示的是 8 位 unsigned char（CHAR_BIT=8）模型。表达式先进行整数提升，最后显式转回 unsigned char；没有把 JavaScript 的位宽当作 C 的默认规则。',
    () => ({value: 172, mask: 0, history: [] as string[]}),
    s => group(element("h3", null, "对象的 8 个数值位"),
      cells(Array.from({length: 8}, (_, i) => (s.value >> (7 - i)) & 1), -1, Array.from({length: 8}, (_, i) => `bit ${7 - i}`)),
      element("h3", null, "点击掩码位"),
      element("div", {className:"memory-row"}, Array.from({length: 8}, (_, i) => { const bit = 7 - i; return button('mask', `${bit}: ${(s.mask >> bit) & 1}`, bit, {className:'memory-cell' + (s.mask & (1 << bit) ? ' active' : ''), 'aria-label':'切换掩码 bit ' + bit}); })),
      code(`unsigned char x = ${s.value};\nunsigned char mask = ${s.mask};\n/* 目标：10001101，即 141 */`),
      controls(group(button('apply', '置一：x | mask', 'or'),
      button('apply', '清零：x & ~mask', 'clear'),
      button('apply', '翻转：x ^ mask', 'xor'),
      button('zero', '清空掩码'))),
      element("p", {className:"lab-trace"}, s.history.join(' → ') || '尚未应用掩码')),
    (s, a, v) => {
      if (a === 'mask') { s.mask ^= 1 << (Number(v)); return result('掩码中的 1 表示本次选中的位；选择对应操作后再应用。'); }
      if (a === 'zero') { s.mask = 0; return result('掩码已清空，对象值不变。'); }
      if (a === 'apply') { if (!s.mask) return result('当前掩码为 0，没有选中任何位。'); const before = s.value; s.value = v === 'or' ? (s.value | s.mask) : v === 'clear' ? (s.value & (~s.mask & 255)) : (s.value ^ s.mask); s.history.push(`${before} ${v === 'or' ? '|' : v === 'clear' ? '& ~' : '^'} ${s.mask} = ${s.value}`); return result(s.value === 141 ? '✓ 结果为 10001101，目标位已更新，其他位保持原状。' : '操作已应用。逐位与目标比较；掩码选错也会改动不该改的位，可重置再试。', s.value === 141); }
      return result('先编辑掩码，再应用操作。');
    }),

  sort: define(
    'sort',
    '排序与查找',
    [12],
    '比较相邻元素，或收缩二分候选区间。',
    '完成稳定冒泡排序；也可切换到下界二分挑战。',
    '排序只按数值比较，字母保留原始身份；相等项不交换。二分使用半开区间 [lo, hi)，查找首个不小于 2 的位置。',
    sortInitial,
    s => group(controls(group(button('mode', '稳定排序', 'sort'),
      button('mode', '下界二分', 'search'))),
      (s.mode === 'sort' ? group(cells(s.data.map(x => `${x.n} · ${x.tag}`), s.index, s.data.map((_, i) => i === s.index || i === s.index + 1 ? '比较中' : '元素')),
      element("p", null, "第 ", s.pass + 1, " 趟；已比较 ", s.comparisons, " 次。", s.done ? '排序完成。2 · A 仍在 2 · C 之前。' : '比较高亮位置与其右邻居。'),
      (!s.done ? controls(group(button('compare', '交换相邻项', 'swap'),
      button('compare', '保持顺序', 'keep'))) : '')) : group(cells([1, 2, 2, 4, 7], s.lo < s.hi ? Math.floor((s.lo + s.hi) / 2) : -1, [1, 2, 2, 4, 7].map((_, i) => i >= s.lo && i < s.hi ? '候选区间' : '已排除')),
      code(`lo = ${s.lo}; hi = ${s.hi};\n${s.lo < s.hi ? `mid = ${Math.floor((s.lo + s.hi) / 2)};\n/* a[mid] 与 2 比较 */` : `/* 下界位置：${s.lo} */`}`),
      (s.lo < s.hi ? controls(group(button('search', 'hi = mid', 'left'),
      button('search', 'lo = mid + 1', 'right'))) : element("p", null, "首个不小于 2 的位置是 1；命中重复值后仍需继续向左收缩。"))))),
    (s, a, v) => {
      if (a === 'mode') { Object.assign(s, sortInitial(), {mode: v === 'search' ? 'search' : 'sort'}); return result('已切换挑战，当前挑战状态已重新开始。'); }
      if (a === 'compare' && s.mode === 'sort' && !s.done) { const swap = s.data[s.index].n > s.data[s.index + 1].n; if ((v === 'swap') !== swap) return result(s.data[s.index].n === s.data[s.index + 1].n ? '数值相等时保持顺序，才能保留 A、C 的先后身份。' : '只有左值严格大于右值时才交换。'); if (swap) [s.data[s.index], s.data[s.index + 1]] = [s.data[s.index + 1], s.data[s.index]]; s.comparisons++; s.index++; if (s.index >= s.data.length - 1 - s.pass) { s.pass++; s.index = 0; if (s.pass >= s.data.length - 1) s.done = true; } return result(s.done ? '✓ 已完成稳定排序；相等的 2 保持 A 在 C 之前。' : '比较正确，进入下一对相邻元素。', s.done); }
      if (a === 'search' && s.mode === 'search' && s.lo < s.hi) { const mid = Math.floor((s.lo + s.hi) / 2); const left = [1, 2, 2, 4, 7][mid] >= 2; if ((v === 'left') !== left) return result('a[mid] >= 2 时，mid 本身仍可能是下界，所以收紧 hi = mid；只有小于 2 时才排除 mid。'); if (left) s.hi = mid; else s.lo = mid + 1; return result(s.lo === s.hi ? '✓ 下界为下标 1。注意：下界本身不是“目标一定存在”的保证，仍需检查位置和值。' : '候选区间正确缩小。', s.lo === s.hi); }
      return result('当前挑战已结束，可以切换或重置。');
    }),

  struct: define(
    'struct',
    '复合对象',
    [14],
    '区分成员值、填充字节和指针目标。',
    '依次判断结构体大小、逻辑相等以及浅拷贝后的别名。',
    '假想 ABI：char 大小 1，对齐 1；int 大小 4，对齐 4；结构体按 4 对齐。填充示意不代表其值有定义或可用于逻辑比较。',
    () => ({stage: 0}),
    s => (s.stage === 0 ? group(code('struct Item { char tag; int count; };'),
      cells(['tag', '填充', '填充', '填充', 'count', 'count', 'count', 'count'], -1, Array.from({length: 8}, (_, i) => `偏移 ${i}`)),
      element("h3", null, "当前 ABI 模型中 sizeof(struct Item) 是多少？"),
      controls([5, 8, 12].map(v => button('answer', String(v), v)))) : (s.stage === 1 ? group(code('struct Item a = {\'X\', 7};\nstruct Item b = {\'X\', 7};\n/* 判断两者业务上的成员值是否相同 */'),
      element("h3", null, "哪种比较符合这里的目标？"),
      controls(group(button('answer', '逐成员比较 tag 和 count', 1),
      button('answer', '只要 memcmp 整体相等才算相同', 0)))) : group(code('struct Box { int *p; };\nint n = 7;\nstruct Box a = { &n };\nstruct Box b = a;\n*b.p = 9;'),
      cells(['a.p → n', 'n = ?', 'b.p → n'], 1),
      element("h3", null, "此时 *a.p 是多少？"),
      controls([7, 9, 0].map(v => button('answer', String(v), v)))))),
    (s, a, v) => {
      if (a !== 'answer') return result('选择一个判断。'); const expected = [8, 1, 9][s.stage];
      if (Number(v) !== expected) return result(['成员间和末尾可能有填充，不能直接把成员大小相加。本模型中 int 从偏移 4 开始。', '逻辑相等应比较相应成员。填充字节不能作为业务相等的依据。', '结构体赋值复制了指针值，没有复制指针指向的 int。a.p 和 b.p 仍指向同一个 n。'][s.stage]);
      if (s.stage === 2) return result('✓ *a.p 为 9。成员值、对象表示和指针目标是不同层次。', true); s.stage++; return result('判断正确。继续观察另一层含义。');
    }),

  resources: define(
    'resources',
    '生命周期与链表',
    [15, 16],
    '模拟分配失败、别名失效和链表删除。',
    '堆实验：保留失败重分配后的旧块，再释放并清理两个别名。链表实验：安全删除头节点。',
    '内存块和节点都是抽象对象。free 不自动把指针变量置空；失效指针不再用于读取。realloc 失败分支预先指定，申请大小非零。',
    resourcesInitial,
    s => group(controls(group(button('mode', '动态内存与别名', 'heap'),
      button('mode', '删除链表头节点', 'list'))),
      (s.mode === 'heap' ? group(code('int *p = malloc(2 * sizeof *p);\n/* 已检查成功，元素初始化为 4、8 */\nint *q = p;\n/* 本轮 realloc 被指定为失败 */'),
      cells([s.p === 'null' ? 'NULL' : s.live ? '→ block' : '失效别名', s.live ? '[4, 8] 存活' : '已释放', s.q === 'null' ? 'NULL' : s.live ? '→ block' : '失效别名'], -1, ['p', '动态对象', 'q']),
      controls(group(button('realloc', '用 tmp 接收 realloc（失败）', 'safe'),
      button('realloc', '直接覆盖 p（失败）', 'direct'),
      button('restore', '从仍有效的 q 恢复 p'),
      button('free', 'free(p)'),
      button('pnull', 'p = NULL'),
      button('readq', '尝试读取 *q'),
      button('qnull', 'q = NULL')))) : group(code('/* 初始链：head → A(1) → B(2) → C(3) → NULL */\n/* 目标：删除 A，同时保留 B、C */'),
      cells([s.listPhase >= 2 ? 'head → B' : 'head → A', s.listPhase >= 3 ? 'A 已释放' : 'A 存活', 'B → C', 'C → NULL'], s.listPhase < 3 ? s.listPhase : -1),
      controls(group(button('list', 'old = head', 0),
      button('list', 'head = old->next', 1),
      button('list', 'free(old)', 2)))))),
    (s, a, v) => {
      if (a === 'mode') { Object.assign(s, resourcesInitial(), {mode: v === 'list' ? 'list' : 'heap'}); return result('当前挑战已重置。'); }
      if (s.mode === 'list') { if (a !== 'list') return result('先选择链表操作。'); if (Number(v) !== s.listPhase) return result(s.listPhase === 0 ? '先保存旧头节点地址，随后才能同时保留待释放对象和新入口。' : s.listPhase === 1 ? '必须在旧头节点还存活时读取 next 并更新 head。先释放再读 next 会越过生命周期。' : 'head 已连接到 B，现在释放旧 A。'); s.listPhase++; return result(s.listPhase === 3 ? '✓ A 已释放，head 仍能到达 B、C。删除操作同时维护链路与所有权。' : '操作顺序正确，继续下一步。', s.listPhase === 3); }
      if (a === 'realloc') { if (!s.live || s.p === 'null') return result('p 当前不再持有可重分配的原块。请重置，或在 q 仍有效时恢复 p。'); s.tried = true; if (v === 'direct') { s.p = 'null'; return result('失败返回 NULL，覆盖了 p。旧块仍存活，本例恰有 q 可以恢复；没有其他有效引用时会丢失释放入口。'); } return result('tmp 为 NULL，因此不覆盖 p。旧块、p 和 q 都保持有效。现在继续释放与别名检查。'); }
      if (a === 'restore') { if (s.live && s.q === 'block') { s.p = 'block'; return result('q 仍有效，已恢复 p。本例的修复依赖保留了这个别名。'); } return result('q 已经不能提供有效旧块入口。不能用失效别名恢复对象。'); }
      if (a === 'free') { if (s.p === 'null') return result('free(NULL) 不执行释放；此处旧块仍须经有效入口释放。'); if (!s.live) return result('重复释放同一对象会产生未定义行为，模型阻止该操作。'); if (!s.tried) return result('先观察一次重分配失败，再进行释放。'); s.live = false; return result('对象已释放。p、q 都成为失效指针；free 没有改写这两个变量。'); }
      if (a === 'pnull') { if (s.live) return result('先完成释放。提前丢弃 p 会改变本轮目标步骤。'); s.p = 'null'; return result(s.q === 'null' && s.blocked ? '✓ 两个指针变量均已置空，失败分支与释放后别名检查已经完成。' : 'p 已置空，但 q 仍需独立检查。置空一个变量不会修复另一个变量。', s.q === 'null' && s.blocked); }
      if (a === 'readq') { if (s.q === 'null') return result('q 为 NULL，也不可解引用。'); if (s.live) return result('*q 为 4。对象尚存活，读取合法。'); s.blocked = true; return result('释放后不能再经 q 读取对象。该操作若在 C 中执行将是未定义行为，模型不显示残留内容。'); }
      if (a === 'qnull') { if (s.live) return result('本轮先释放对象，再整理失效别名。'); if (!s.blocked) return result('先用“尝试读取 *q”检查别名边界；模型会阻止实际读取。'); s.q = 'null'; return result(s.p === 'null' ? '✓ 失败分支保留旧块，已释放一次，并将两个指针变量清空。' : 'q 已置空。p 仍需单独置空。', s.p === 'null'); }
      return result('选择一个内存操作。');
    }),

  streams: define(
    'streams',
    '文件与流状态',
    [17],
    '区分读到最后一个字符与发现输入结束。',
    '读完 AB 后再读一次，观察 EOF；clearerr 后检查位置，再 rewind 并读到 A。',
    '模拟可定位的只读字节流，内容为 ASCII AB，无实际磁盘读写。EOF 是 fgetc 的特殊返回，不是文件里的字符。',
    () => ({position: 0, eof: false, error: false, last: '尚未读取', sawEnd: false, cleared: false, rewound: false}),
    s => group(code('int ch = fgetc(stream);\n/* ch 能容纳 unsigned char 转为 int 的值和 EOF */'),
      cells(['A', 'B', '末尾'], s.position),
      cells([s.last, s.eof ? '已置位' : '未置位', s.error ? '已置位' : '未置位', s.position], -1, ['fgetc 最近返回', 'EOF 指示器', '错误指示器', '位置']),
      controls(group(button('read', 'fgetc：读取一个字符'),
      button('eof', '检查 feof'),
      button('clear', 'clearerr：清除指示器'),
      button('rewind', 'rewind：回到起点')))),
    (s, a) => {
      if (a === 'eof') return result(s.eof ? 'feof 非零：之前某次读取已经发现输入结束。它不是预言下一次读取的接口。' : 'feof 为零。即使位置已在末尾，也要由一次读取发现输入结束才置位。');
      if (a === 'read') { if (s.position >= 2) { s.last = 'EOF'; s.eof = true; s.sawEnd = true; return result('这次未读到字符，返回 EOF 并置位 EOF 指示器。位置仍在末尾。'); } const value = 'AB'[s.position]; s.position++; s.last = `${value}（${value.charCodeAt(0)}）`; if (s.rewound && value === 'A') return result('✓ rewind 后重新读到 A。已区分位置、读取返回值以及 EOF 指示器。', true); return result(value === 'B' ? '读到最后一个字符 B，但这次读取成功，EOF 指示器仍未置位。再读一次看看。' : '成功读取 A。'); }
      if (a === 'clear') { if (!s.sawEnd) return result('本轮先读取到发现输入结束，再观察清除的效果。'); s.eof = false; s.error = false; s.cleared = true; return result('指示器已清除，但位置仍为 2。clearerr 不等于回到文件开头；再读仍会发现结束。'); }
      if (a === 'rewind') { if (!s.cleared) return result('先用 clearerr 观察“清状态不移动位置”的区别。'); s.position = 0; s.eof = false; s.error = false; s.rewound = true; s.last = '已回到起点'; return result('位置回到起点，EOF 和错误指示器被清除。现在再读一个字符。'); }
      return result('选择一种流操作。');
    }),

  math: define(
    'math',
    '数学、随机与时间',
    [18],
    '看见取模偏差，辨认取整和时间接口。',
    '枚举一个小随机源，修复映射偏差；也可练习负数取整和时间差。',
    '随机源是八个等可能值 0…7 的教学模型，不是 rand() 的实际取值范围；不声称 rand() 适合安全随机用途。时间题不假定 time_t 使用特定纪元。',
    mathInitial,
    s => group(controls(group(button('mode', '随机映射', 'random'),
      button('mode', '取整与时间', 'round'))),
      (s.mode === 'random' ? group(code(s.rejecting ? '/* 接受 0…5，拒绝 6、7 后重新抽样 */\nresult = source % 3;' : '/* 均匀 source ∈ {0,1,2,3,4,5,6,7} */\nresult = source % 3;'),
      cells(Array.from({length: 8}, (_, i) => s.rejecting && i >= 6 ? `${i}：拒绝` : `${i} → ${i % 3}`), s.index < 8 ? s.index : -1),
      cells(s.counts, -1, ['结果 0 的原像数', '结果 1 的原像数', '结果 2 的原像数']),
      controls((s.index < 8 ? button('step', '枚举下一个源值') : (s.rejecting ? button('finish', '核对均匀性') : button('reject', '拒绝 6、7，重新枚举'))))) : group(code(s.roundStage === 0 ? 'double x = -2.7;\n/* 比较 floor(x)、ceil(x)、trunc(x) */' : 'time_t start = /* 较早时刻 */;\ntime_t end = /* 较晚时刻 */;\n/* 需要可移植地求以秒为单位的差 */'),
      (s.roundStage === 0 ? group(element("h3", null, "哪组结果正确？"),
      controls(group(button('round', 'floor=-3，ceil=-2，trunc=-2', 1),
      button('round', 'floor=-2，ceil=-3，trunc=-3', 0),
      button('round', '三个结果都是 -2', 2)))) : group(element("h3", null, "应当优先使用哪种方式？"),
      controls(group(button('time', 'difftime(end, start)', 1),
      button('time', '假定 time_t 就是从 1970 起的整数秒', 0)))))))),
    (s, a, v) => {
      if (a === 'mode') { Object.assign(s, mathInitial(), {mode: v === 'round' ? 'round' : 'random'}); return result('已切换并重新开始当前挑战。'); }
      if (a === 'step' && s.mode === 'random' && s.index < 8) { const value = s.index++; if (!s.rejecting || value < 6) s.counts[value % 3]++; return result(s.index === 8 ? (s.rejecting ? '可接受原像数变成 2、2、2。核对是否达到目标。' : '原像数为 3、3、2，所以三种输出并不等可能。') : (s.rejecting && value >= 6 ? '本源值被拒绝，不计入任何输出；实际算法会重新抽样。' : `源值 ${value} 映射到 ${value % 3}。`)); }
      if (a === 'reject' && s.index === 8) { s.rejecting = true; s.index = 0; s.counts = [0, 0, 0]; return result('只接受可被 3 整除数量的源值。重新枚举观察原像数。'); }
      if (a === 'finish' && s.rejecting && s.index === 8) return result('✓ 原像数均为 2。拒绝采样消除了此均匀源模型中的取模偏差，但可能需要重抽。', true);
      if (a === 'round' && s.mode === 'round' && s.roundStage === 0) { if (Number(v) !== 1) return result('floor 向负无穷，ceil 向正无穷，trunc 向零。负数时不能把 floor 当作截断小数部分。'); s.roundStage = 1; return result('取整判断正确。再检查与实现表示有关的时间接口。'); }
      if (a === 'time' && s.mode === 'round' && s.roundStage === 1) return Number(v) === 1 ? result('✓ difftime 按接口求秒差；ISO C 不要求 time_t 使用 Unix 纪元或固定整数表示。', true) : result('特定平台可能使用 Unix 时间戳，但 ISO C 的可移植接口应使用 difftime。');
      return result('先完成当前步骤。');
    })
};

export const catalog = Object.values(models);
export function getLab(id: string) {
  return Object.hasOwn(models, id) ? models[id as keyof typeof models] : undefined;
}
