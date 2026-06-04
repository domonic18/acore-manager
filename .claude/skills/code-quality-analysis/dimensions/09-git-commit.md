# 维度 9：Git 提交规范 (8 分)

## 检查项与权重

| 检查项 | 说明 | 权重 | 得分标准 |
|--------|------|------|----------|
| 提交类型规范 | 是否使用 Conventional Commits 等规范 | 40% (3.2分) | ≥80%符合规范得满分，50-80%得1.5分，<50%得0分 |
| 提交描述质量 | 描述是否清晰、有足够上下文 | 35% (2.8分) | 描述清晰得满分，简单描述得1.5分，过于简单得0分 |
| 提交粒度 | 每次提交是否聚焦单一变更 | 25% (2分) | 粒度合理得满分，粒度过大/过小得1分，混乱得0分 |

## 行业规范标准（Conventional Commits）

标准的提交信息格式：
```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）必须是以下之一：**
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档变更
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `chore`: 构建/工具相关
- `ci`: CI/CD 相关
- `revert`: 回滚提交

**描述质量标准：**
- 优秀：描述清晰说明"做了什么"和"为什么"，如 `feat(auth): 添加 JWT 刷新机制以提升用户体验`
- 合格：有类型和简短描述，如 `fix: 修复登录失败问题`
- 不合格：过于简单，如 `fix`、`update`、`改bug`

## Bash 检查命令

```bash
# 获取最近 50 条提交记录进行分析
echo "=== Git 提交历史分析 (最近50条) ==="
cd <path> && git log --oneline -50 2>/dev/null

echo ""
echo "=== 提交类型统计 ==="
cd <path> && git log --format="%s" -50 2>/dev/null | grep -oE "^[a-z]+" | sort | uniq -c | sort -rn

echo ""
echo "=== 符合 Conventional Commits 的提交比例 ==="
total=$(cd <path> && git log --oneline -50 2>/dev/null | wc -l)
conventional=$(cd <path> && git log --format="%s" -50 2>/dev/null | grep -cE "^(feat|fix|docs|style|refactor|perf|test|chore|ci|revert|build)(\(.+\))?:")
if [ "$total" -gt 0 ]; then
  ratio=$((conventional * 100 / total))
  echo "符合规范的提交: $conventional / $total (${ratio}%)"
fi

echo ""
echo "=== 可能不符合规范的提交（示例）==="
cd <path> && git log --format="%s" -50 2>/dev/null | grep -vE "^(feat|fix|docs|style|refactor|perf|test|chore|ci|revert|build)(\(.+\))?:" | head -10

echo ""
echo "=== 提交描述长度分析 ==="
cd <path> && git log --format="%s" -50 2>/dev/null | while read line; do
  len=${#line}
  if [ "$len" -lt 10 ]; then
    echo "过短 ($len 字符): $line"
  fi
done | head -10

echo ""
echo "=== 单词类提交（过于简单）检测 ==="
cd <path> && git log --format="%s" -50 2>/dev/null | grep -E "^[a-zA-Z]{1,8}$" | head -10

echo ""
echo "=== 提交粒度分析（通过文件变更数）==="
echo ">>> 每次提交涉及的文件数 (最近20条):"
cd <path> && git log --stat --oneline -20 2>/dev/null | grep -E "file.*changed" | head -20
```
