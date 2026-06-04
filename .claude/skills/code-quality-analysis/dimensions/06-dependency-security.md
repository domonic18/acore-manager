# 维度 6：依赖安全 (7 分)

## 检查项与权重

| 检查项 | 说明 | 权重 | 得分标准 |
|--------|------|------|----------|
| 依赖文件 | package.json/requirements.txt 存在性 | 30% (2.1分) | 存在得满分，不存在得0分 |
| 高危漏洞 | npm audit / pip audit 检测 | 40% (2.8分) | 0个得满分，1-2个得1.4分，>2个得0分 |
| 中危漏洞 | npm audit / pip audit 检测 | 30% (2.1分) | 0-3个得满分，4-10个得1分，>10个得0分 |

## Bash 检查命令

```bash
# 检查依赖文件
echo "=== 依赖文件检查 ==="
if [ -f "<path>/package.json" ]; then
  echo "package.json: 存在"
  # npm audit 检查漏洞
  echo "=== npm audit 结果 ==="
  cd <path> && npm audit --json 2>/dev/null | head -100
elif [ -f "<path>/requirements.txt" ]; then
  echo "requirements.txt: 存在"
  # pip-audit 检查漏洞（如果可用）
  echo "=== pip-audit 结果 ==="
  pip-audit -r <path>/requirements.txt --format=json 2>/dev/null || echo "pip-audit 未安装或检查失败"
elif [ -f "<path>/pyproject.toml" ]; then
  echo "pyproject.toml: 存在"
else
  echo "依赖文件: 未找到标准依赖文件"
fi

# 检查锁定文件
[ -f "<path>/package-lock.json" ] && echo "package-lock.json: 存在"
[ -f "<path>/yarn.lock" ] && echo "yarn.lock: 存在"
[ -f "<path>/poetry.lock" ] && echo "poetry.lock: 存在"
```
