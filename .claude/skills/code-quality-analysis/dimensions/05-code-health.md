# 维度 5：代码健康度 (10 分)

## 检查项与权重

| 指标 | 检查方式 | 权重 | 得分标准 |
|------|---------|------|----------|
| 注释覆盖率 | 注释行/总行数 | 60% (6分) | ≥15%得满分，10-15%得4分，5-10%得2分，<5%得0分 |
| TODO/FIXME 数量 | grep 计数 | 40% (4分) | ≤20个得满分，21-50个得2分，>50个得0分 |

## Bash 检查命令

```bash
# 注释覆盖率 - Python
echo "=== Python 注释覆盖率 ==="
py_total=$(find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" -exec cat {} + 2>/dev/null | wc -l)
py_comments=$(find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" -exec cat {} + 2>/dev/null | grep -cE "^\s*#|^\s*\"\"\"" || echo 0)
if [ "$py_total" -gt 0 ]; then
  py_ratio=$(echo "scale=2; $py_comments * 100 / $py_total" | bc)
  echo "Python 注释覆盖率: ${py_ratio}%"
fi

# 注释覆盖率 - TypeScript/JavaScript
echo "=== TS/JS 注释覆盖率 ==="
js_total=$(find <path> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" -exec cat {} + 2>/dev/null | wc -l)
js_comments=$(find <path> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" -exec cat {} + 2>/dev/null | grep -cE "^\s*//|^\s*/\*" || echo 0)
if [ "$js_total" -gt 0 ]; then
  js_ratio=$(echo "scale=2; $js_comments * 100 / $js_total" | bc)
  echo "TS/JS 注释覆盖率: ${js_ratio}%"
fi

# TODO/FIXME 统计
echo "=== TODO/FIXME 统计 ==="
todo_count=$(grep -rE "TODO|FIXME|XXX|HACK" <path> --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null | wc -l)
echo "TODO/FIXME 总数: $todo_count"

# 显示具体的 TODO/FIXME
echo "=== 具体 TODO/FIXME 列表（前20个）==="
grep -rnE "TODO|FIXME" <path> --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null | head -20
```
