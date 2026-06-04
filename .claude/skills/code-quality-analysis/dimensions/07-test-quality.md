# 维度 7：测试质量 (7 分)

## 检查项与权重

| 检查项 | 标准 | 权重 | 得分标准 |
|--------|------|------|----------|
| 测试文件数量 | 统计测试文件数 | 50% (3.5分) | ≥50个得满分，20-49个得2分，5-19个得1.5分，<5个得0分 |
| 测试目录结构 | tests/unit/、tests/integration/ 等 | 50% (3.5分) | 结构完善得满分，仅有单层目录得1.5分，无测试目录得0分 |

## Bash 检查命令

```bash
# 统计测试文件
echo "=== 测试文件统计 ==="
py_tests=$(find <path> -name "*test*.py" -o -name "test_*.py" -o -name "*_test.py" ! -path "*/venv/*" ! -path "*/__pycache__/*" 2>/dev/null | wc -l)
js_tests=$(find <path> \( -name "*test*.ts" -o -name "*test*.js" -o -name "*spec*.ts" -o -name "*spec*.js" \) ! -path "*/node_modules/*" 2>/dev/null | wc -l)
echo "Python 测试文件: $py_tests"
echo "JS/TS 测试文件: $js_tests"
echo "测试文件总数: $((py_tests + js_tests))"

# 检查测试目录结构
echo "=== 测试目录结构 ==="
find <path> -type d \( -name "tests" -o -name "__tests__" -o -name "test" -o -name "spec" \) ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null | while read dir; do
  echo "目录: $dir"
  ls -la "$dir" 2>/dev/null | head -10
done

# 检查是否有单元测试/集成测试分层
echo "=== 测试分层检查 ==="
find <path> -type d \( -name "unit" -o -name "integration" -o -name "e2e" -o -name "functional" \) ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null
```
