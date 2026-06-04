# 维度 2：目录结构 (10 分)

## 检查项与权重

| 检查项 | 标准 | 权重 | 得分标准 |
|--------|------|------|----------|
| 层级深度 | ≤4 层为优，>6 层为差 | 25% (2.5分) | ≤4层得满分，5-6层得1.5分，>6层得0分 |
| 命名规范 | kebab-case 或 snake_case | 25% (2.5分) | 全部规范得满分，>20%不规范得0分 |
| 模块划分 | src/core/api 分层清晰 | 30% (3分) | 分层清晰得满分，部分清晰得1.5分，混乱得0分 |
| 测试目录 | tests/ 或 __tests__ 存在 | 20% (2分) | 存在得满分，不存在得0分 |

## Bash 检查命令

```bash
# 检查目录层级深度（排除 node_modules、venv、.git 等）
max_depth=$(find <path> -type d ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/venv/*" ! -path "*/__pycache__/*" ! -path "*/dist/*" ! -path "*/build/*" 2>/dev/null | awk -F'/' '{print NF}' | sort -rn | head -1)
echo "最大目录深度: $max_depth 层"

# 检查命名规范（检查是否有空格或大写字母开头的目录）
bad_names=$(find <path> -type d ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/venv/*" -name "*[A-Z\ ]*" 2>/dev/null | head -10)
if [ -z "$bad_names" ]; then
  echo "命名规范: 符合规范"
else
  echo "命名规范: 存在不符合规范的目录"
  echo "$bad_names"
fi

# 检查模块划分
echo "=== 主要目录结构 ==="
ls -d <path>/*/ 2>/dev/null | head -20

# 检查测试目录
test_dirs=$(find <path> -type d \( -name "tests" -o -name "__tests__" -o -name "test" -o -name "spec" \) ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null)
if [ -n "$test_dirs" ]; then
  echo "测试目录: 存在 ($test_dirs)"
else
  echo "测试目录: 缺失"
fi
```
