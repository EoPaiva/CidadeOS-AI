export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: 'CidadeOS AI',
    phase: 'fase-2-2-deploy-preview',
    status: 'online-preview',
    mode: 'vercel-static-preview',
    timestamp: new Date().toISOString()
  });
}
