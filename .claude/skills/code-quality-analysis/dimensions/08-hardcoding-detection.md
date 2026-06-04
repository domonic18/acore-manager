# 维度 8：硬编码检测 (8 分)

## 检查项与权重

| 检查项 | 说明 | 权重 | 得分标准 |
|--------|------|------|----------|
| 敏感信息硬编码 | API Key、密码、Token 等 | 40% (3.2分) | 0处得满分，1-2处得1.5分，>2处得0分 |
| 配置硬编码 | IP地址、URL、数据库连接串 | 35% (2.8分) | 0-3处得满分，4-10处得1.5分，>10处得0分 |
| 魔法数字 | 未定义常量的数值 | 25% (2分) | 评估严重程度给分 |

## Bash 检查命令

```bash
# 检测敏感信息硬编码
echo "=== 敏感信息硬编码检测 ==="
echo ">>> API Key / Token 模式:"
grep -rnE "(api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|password|passwd)\s*[=:]\s*['\"][^'\"]{10,}['\"]" <path> --include="*.py" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/.env*" ! -path "*/test*" 2>/dev/null | head -20

echo ">>> AWS / 云服务密钥模式:"
grep -rnE "(AKIA[0-9A-Z]{16}|aws[_-]?secret|azure[_-]?key|gcp[_-]?key)" <path> --include="*.py" --include="*.ts" --include="*.js" ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null | head -10

# 检测配置硬编码
echo "=== 配置硬编码检测 ==="
echo ">>> IP 地址硬编码:"
grep -rnE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" <path> --include="*.py" --include="*.ts" --include="*.js" ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/test*" 2>/dev/null | grep -v "127.0.0.1" | grep -v "0.0.0.0" | grep -v "localhost" | grep -v "example" | head -15

echo ">>> URL 硬编码 (非示例域名):"
grep -rnE "https?://[^'\"]+(?!example|localhost|test|mock|dummy)" <path> --include="*.py" --include="*.ts" --include="*.js" ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/test*" ! -path "*/.md" 2>/dev/null | grep -v "github.com" | grep -v "npmjs.com" | grep -v "pypi.org" | head -15

echo ">>> 数据库连接串硬编码:"
grep -rnE "(mysql|postgres|mongodb|redis)://[^'\"]+" <path> --include="*.py" --include="*.ts" --include="*.js" ! -path "*/node_modules/*" ! -path "*/venv/*" ! -path "*/test*" ! -path "*/.env*" 2>/dev/null | head -10

# 检测魔法数字（简化版）
echo "=== 魔法数字检测 (抽样) ==="
echo ">>> 可能的魔法数字 (排除常见值):"
for f in $(find <path> -name "*.py" ! -path "*/venv/*" ! -path "*/test*" -type f 2>/dev/null | head -20); do
  magic=$(grep -nE "[^0-9_](100|[5-9][0-9]|[1-9][0-9]{2,})[^0-9]" "$f" 2>/dev/null | grep -v "port" | grep -v "timeout" | grep -v "# " | head -5)
  if [ -n "$magic" ]; then
    echo "文件: $f"
    echo "$magic"
  fi
done

# 检查是否有配置文件或环境变量使用
echo "=== 配置管理检查 ==="
[ -f "<path>/.env.example" ] && echo ".env.example: 存在" || echo ".env.example: 缺失"
[ -f "<path>/.env" ] && echo ".env: 存在 (注意: 不应提交到版本控制)"
[ -d "<path>/config" ] && echo "config/ 目录: 存在" || echo "config/ 目录: 缺失"
grep -r "os\.getenv\|process\.env\|environ" <path> --include="*.py" --include="*.ts" --include="*.js" ! -path "*/node_modules/*" ! -path "*/venv/*" 2>/dev/null | wc -l | xargs -I {} echo "环境变量使用处: {} 处"
```
