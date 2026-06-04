# 维度 3：代码规模 (10 分)

## 检查项与权重

| 指标 | 阈值 | 权重 | 得分标准 |
|------|------|------|----------|
| 大文件 | >500 行 | 50% (5分) | ≤10个得满分，11-20个得3分，>20个得0分 |
| 超大文件 | >1000 行 | 30% (3分) | ≤3个得满分，4-5个得1.5分，>5个得0分 |
| 代码总行数 | 统计记录 | 20% (2分) | 仅记录统计，不扣分 |

## Bash 检查命令

```bash
# 统计大文件（>500行）- Python
echo "=== Python 大文件 (>500行) ==="
find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/.venv/*" ! -path "*/__pycache__/*" -exec sh -c 'lines=$(wc -l < "$1" 2>/dev/null); if [ "$lines" -gt 500 ]; then echo "$lines $1"; fi' _ {} \; 2>/dev/null | sort -rn | head -20

# 统计大文件（>500行）- TypeScript/JavaScript
echo "=== TS/JS 大文件 (>500行) ==="
find <path> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" ! -path "*/build/*" -exec sh -c 'lines=$(wc -l < "$1" 2>/dev/null); if [ "$lines" -gt 500 ]; then echo "$lines $1"; fi' _ {} \; 2>/dev/null | sort -rn | head -20

# 统计超大文件（>1000行）
echo "=== 超大文件 (>1000行) ==="
find <path> \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/__pycache__/*" ! -path "*/dist/*" -exec sh -c 'lines=$(wc -l < "$1" 2>/dev/null); if [ "$lines" -gt 1000 ]; then echo "$lines $1"; fi' _ {} \; 2>/dev/null | sort -rn

# 统计大文件总数
large_500=$(find <path> \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/__pycache__/*" ! -path "*/dist/*" -exec sh -c 'lines=$(wc -l < "$1" 2>/dev/null); if [ "$lines" -gt 500 ]; then echo "$1"; fi' _ {} \; 2>/dev/null | wc -l)
large_1000=$(find <path> \( -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/__pycache__/*" ! -path "*/dist/*" -exec sh -c 'lines=$(wc -l < "$1" 2>/dev/null); if [ "$lines" -gt 1000 ]; then echo "$1"; fi' _ {} \; 2>/dev/null | wc -l)
echo "大文件(>500行)总数: $large_500"
echo "超大文件(>1000行)总数: $large_1000"

# 统计代码总行数
echo "=== 代码总行数 ==="
echo "Python:"
find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" -exec cat {} + 2>/dev/null | wc -l
echo "TypeScript/JavaScript:"
find <path> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) ! -path "*/node_modules/*" ! -path "*/dist/*" -exec cat {} + 2>/dev/null | wc -l
```
