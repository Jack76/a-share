
# 短线交易实操框架

基于 Vite、React 和 Supabase Edge Function 的 A 股短线交易决策界面。

## 本地运行

要求 Node.js 20+ 与 pnpm 10+。

```bash
pnpm install
pnpm dev
```

启动后访问 `http://127.0.0.1:4174`，不使用 5173 端口。生产构建使用：

```bash
pnpm build
pnpm preview
```

## 风险说明

系统的信号、止损和仓位建议均为研究与决策辅助，不构成投资建议，也不保证收益。回测结果不代表未来收益；隔夜跳空、流动性、停牌与 T+1 限制可能使实际损失高于估算。
  
