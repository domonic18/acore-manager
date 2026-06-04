# 维度 4：复杂度 (12 分)

## 检查项与权重

| 指标 | 阈值 | 权重 | 得分标准 |
|------|------|------|----------|
| 圈复杂度 | >20 分支为高复杂度 | 40% (4.8分) | ≤5个高复杂度文件得满分，6-10个得2.4分，>10个得0分 |
| 嵌套深度 | >4 层为过深嵌套 | 30% (3.6分) | ≤5个文件得满分，6-10个得1.8分，>10个得0分 |
| 函数长度 | >100 行为过长函数 | 30% (3.6分) | ≤10个得满分，11-20个得1.8分，>20个得0分 |

## Bash 检查命令

```bash
# 圈复杂度评估 - Python（统计分支语句数量）
echo "=== Python 高复杂度文件 (>20分支) ==="
for f in $(find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" -type f 2>/dev/null); do
  complexity=$(grep -cE "^\s*(if|elif|for|while|try|except|with)\b" "$f" 2>/dev/null || echo 0)
  if [ "$complexity" -gt 20 ]; then
    echo "复杂度 $complexity: $f"
  fi
done | sort -t' ' -k2 -rn | head -20

# 圈复杂度评估 - TypeScript/JavaScript
echo "=== TS/JS 高复杂度文件 (>25分支) ==="
for f in $(find <path> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) ! -path "*/node_modules/*" ! -path "*/dist/*" -type f 2>/dev/null); do
  complexity=$(grep -cE "\b(if|else|for|while|switch|case|try|catch)\b" "$f" 2>/dev/null || echo 0)
  if [ "$complexity" -gt 25 ]; then
    echo "复杂度 $complexity: $f"
  fi
done | sort -t' ' -k2 -rn | head -20

# 嵌套深度检测（简化版：检查连续缩进）
echo "=== 可能存在过深嵌套的文件 ==="
# Python: 检查是否有超过4个缩进级别的代码行
for f in $(find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" -type f 2>/dev/null | head -30); do
  deep_nested=$(grep -E "^\s{16,}\S" "$f" 2>/dev/null | wc -l)
  if [ "$deep_nested" -gt 5 ]; then
    echo "深嵌套风险 ($deep_nested 行): $f"
  fi
done

# 函数长度检测（Python: 简化估算）
echo "=== 可能存在过长函数的文件 ==="
# 这个需要更复杂的分析，这里仅标记可能的问题文件
```
