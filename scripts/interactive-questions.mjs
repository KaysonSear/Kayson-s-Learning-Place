// Authored alternatives using interaction instead of free-text tokens.
export const interactiveQuestions = new Map([
  ['p13-b', {
    kind:'order', prompt:'把构建步骤排成顺序。从 .c 源文件开始，到得到可执行程序为止。',
    options:['链接目标文件与库','汇编成目标文件','预处理头文件和宏','编译成汇编文本'], answer:[2,3,1,0],
    explanation:'常见构建顺序是预处理 → 编译 → 汇编 → 链接。工具链可以合并这些阶段，不一定留下每个中间文件。', hint:'先处理 #include 和宏；需要其他目标文件定义的工作最后做。'
  }],
  ['p288-b', {
    kind:'match', prompt:'这些声明都写在函数的形参列表里。为每个形参选出调整后的类型。',
    items:['int a[4]','int a[2][3]','int *a[4]'], options:['int **','int (*)[3]','int *'], answer:[2,1,0],
    explanation:'数组形参只调整最外层：一个数组参数调整为指向其元素类型的指针。二维数组的元素是整行 int[3]，不能把它误作 int **；指针数组的元素是 int *。', hint:'先找出每个数组的元素类型，再加一层指针。'
  }],
  ['p370-b', {
    kind:'choice', prompt:'代码要把缓冲区的前 5 字节向右移动 1 格。缓冲区有 8 格。怎样修复这次搬移？',
    code:'unsigned char buf[8] = {1, 2, 3, 4, 5, 0, 0, 0};\nmemcpy(buf + 1, buf, 5);',
    options:['换成 memmove(buf + 1, buf, 5)','交换 memcpy 的源和目标参数','保留 memcpy，只在 buf[7] 写入 0'], answer:0,
    explanation:'源区间 [0,5) 和目标区间 [1,6) 重叠。memcpy 不允许重叠；memmove 按等效的临时副本语义处理。交换方向也仍然重叠，补 0 与此无关。', hint:'写出源和目标下标的区间，看看它们是否有交集。'
  }],
  ['p777-b', {
    kind:'order', prompt:'调整动态数组时，失败路径必须保留 p 原来持有的分配。把三行按安全顺序排好。n > 0，乘法大小已检查；failed 只处理失败，不修改 p。',
    options:['p = tmp;','int *tmp = realloc(p, n * sizeof *p);','if (tmp == NULL) goto failed;'], answer:[1,2,0],
    explanation:'先将 realloc 的结果放入临时指针。非零大小请求失败时，旧分配仍在；先跳到失败路径，才能避免用空指针覆盖 p。只有成功才更新 p。', hint:'判断分配是否成功之前，不能用返回值覆盖唯一的旧地址。'
  }],
  ['p815-b', {
    kind:'order', prompt:'cur 指向动态分配的非空链表节点。把三行排成安全的“释放当前节点，再继续遍历”顺序。',
    options:['cur = next;','free(cur);','Node *next = cur->next;'], answer:[2,1,0],
    explanation:'先在 cur 仍有效时保存后继，再释放当前对象，最后用已保存的指针继续遍历。释放后访问 cur->next 会使用生存期已结束的对象。', hint:'需要读取节点成员的那一步，要在节点释放前执行。'
  }],
]);
