'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store'

const GJ_THEME = `
  .gjs-one-bg { background-color: var(--bg-surface) !important; }
  .gjs-two-color { color: var(--text-secondary) !important; }
  .gjs-three-bg { background-color: var(--brand) !important; color: #fff !important; }
  .gjs-four-color, .gjs-four-color-h:hover { color: var(--brand) !important; }
  .gjs-pn-panel { padding: 0 !important; }
  .gjs-pn-btn { padding: 6px 10px !important; min-width: 34px !important; height: 34px !important; border-radius: 8px !important; border: 1px solid var(--border-default) !important; background: var(--bg-surface) !important; color: var(--text-secondary) !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; cursor: pointer !important; transition: all 0.12s !important; }
  .gjs-pn-btn:hover { background: var(--bg-elevated) !important; color: var(--text-primary) !important; border-color: var(--border-strong) !important; }
  .gjs-pn-active { background: var(--brand) !important; color: #fff !important; border-color: var(--brand) !important; }
  .gjs-block { width: 100% !important; height: auto !important; min-height: 44px !important; border-radius: 8px !important; border: 1px solid var(--border-default) !important; background: var(--bg-base) !important; color: var(--text-secondary) !important; font-size: 0.75rem !important; font-weight: 600 !important; cursor: pointer !important; transition: all 0.12s !important; display: flex !important; align-items: center !important; justify-content: center !important; text-align: center !important; padding: 8px 6px !important; font-family: var(--font-body) !important; }
  .gjs-block:hover { border-color: var(--brand) !important; background: var(--bg-elevated) !important; color: var(--text-primary) !important; }
  .gjs-block-label { font-size: inherit !important; }
  .gjs-block__media { margin: 0 !important; }
  .gjs-block-svg { display: none !important; }
  .gjs-block-svg-path { display: none !important; }
  .gjs-cv-canvas { background: var(--bg-base) !important; }
  .gjs-cv-canvas-bg { background: var(--bg-base) !important; }
  .gjs-frame { background: #fff !important; border-radius: 4px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.15) !important; }
  .gjs-layer-item { padding: 6px 8px !important; border-radius: 6px !important; font-size: 0.76rem !important; font-family: var(--font-body) !important; color: var(--text-secondary) !important; cursor: pointer !important; transition: background 0.12s !important; }
  .gjs-layer-item:hover { background: var(--bg-elevated) !important; }
  .gjs-layer-name { color: var(--text-primary) !important; }
  .gjs-layer-title { font-weight: 600 !important; font-size: 0.74rem !important; color: var(--text-primary) !important; }
  .gjs-layer-count { color: var(--text-tertiary) !important; font-size: 0.68rem !important; }
  .gjs-layer-selected { background: var(--bg-elevated) !important; }
  .gjs-layer-vis { color: var(--text-tertiary) !important; }
  .gjs-layer-caret { color: var(--text-tertiary) !important; }
  .gjs-layer-move { color: var(--text-tertiary) !important; }
  .gjs-field { background: var(--bg-base) !important; border: 1px solid var(--border-default) !important; border-radius: 6px !important; }
  .gjs-field input, .gjs-field select, .gjs-field textarea { background: transparent !important; color: var(--text-primary) !important; font-family: var(--font-body) !important; font-size: 0.76rem !important; }
  .gjs-label { font-size: 0.72rem !important; font-weight: 600 !important; color: var(--text-secondary) !important; font-family: var(--font-body) !important; }
  .gjs-sm-sector { border-bottom: 1px solid var(--border-default) !important; }
  .gjs-sm-sector-title { font-size: 0.74rem !important; font-weight: 700 !important; color: var(--text-primary) !important; background: transparent !important; padding: 8px 0 !important; font-family: var(--font-body) !important; }
  .gjs-sm-sector .gjs-sm-sector-title { padding: 8px !important; }
  .gjs-sm-sector-title:hover { background: var(--bg-elevated) !important; }
  .gjs-sm-properties { padding: 8px 0 !important; }
  .gjs-sm-property { padding: 4px 0 !important; }
  .gjs-clm-tags { padding: 4px 0 !important; }
  .gjs-clm-tag { border-radius: 6px !important; border: 1px solid var(--border-default) !important; background: var(--bg-base) !important; color: var(--text-primary) !important; font-size: 0.72rem !important; padding: 3px 8px !important; font-family: var(--font-body) !important; }
  .gjs-clm-tag-status { color: var(--brand) !important; }
  .gjs-clm-tag-close { color: var(--text-tertiary) !important; }
  .gjs-clm-header { font-size: 0.74rem !important; font-weight: 700 !important; color: var(--text-primary) !important; font-family: var(--font-body) !important; }
  .gjs-trt-trait { padding: 4px 0 !important; }
  .gjs-trt-label { font-size: 0.72rem !important; font-weight: 600 !important; color: var(--text-secondary) !important; font-family: var(--font-body) !important; }
  .gjs-color-warn { color: #d97706 !important; }
  .gjs-color-active { color: var(--brand) !important; }
  .gjs-composite-bar { background: var(--bg-elevated) !important; }
  .gjs-field-arrows { color: var(--text-tertiary) !important; }
  .gjs-field-arrows:hover { color: var(--text-primary) !important; }
  .gjs-field-checkbox { color: var(--brand) !important; }
  .gjs-badge { border-radius: 6px !important; font-size: 0.68rem !important; font-family: var(--font-body) !important; }
  .gjs-offset-v { color: var(--text-tertiary) !important; }
  .gjs-selected-parent { border-radius: 6px !important; font-family: var(--font-body) !important; }
  .gjs-pn-btn.gjs-pn-active { background: var(--brand) !important; color: #fff !important; border-color: var(--brand) !important; box-shadow: none !important; }
  .gjs-pn-views { border-bottom: 1px solid var(--border-default) !important; }
  .gjs-pn-views .gjs-pn-btn { border-radius: 0 !important; border: none !important; border-bottom: 2px solid transparent !important; background: transparent !important; }
  .gjs-pn-views .gjs-pn-btn.gjs-pn-active { border-bottom-color: var(--brand) !important; background: transparent !important; color: var(--text-primary) !important; }
  .gjs-am-assets { display: grid !important; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)) !important; gap: 8px !important; padding: 8px !important; }
  .gjs-am-asset { border-radius: 6px !important; border: 1px solid var(--border-default) !important; overflow: hidden !important; cursor: pointer !important; }
  .gjs-am-asset:hover { border-color: var(--brand) !important; }
  .gjs-am-asset-image { width: 100% !important; height: 80px !important; object-fit: cover !important; }
  .gjs-am-add-asset { display: flex !important; align-items: center !important; justify-content: center !important; gap: 8px !important; padding: 12px !important; border-radius: 8px !important; border: 2px dashed var(--border-default) !important; background: var(--bg-base) !important; cursor: pointer !important; color: var(--text-secondary) !important; font-size: 0.8rem !important; font-family: var(--font-body) !important; }
  .gjs-am-add-asset:hover { border-color: var(--brand) !important; color: var(--brand) !important; }
  .gjs-am-close { display: none !important; }
  .gjs-am-meta { display: none !important; }
  .gjs-am-file-uploader { padding: 10px !important; }
  ::-webkit-scrollbar { width: 6px !important; }
  ::-webkit-scrollbar-track { background: transparent !important; }
  ::-webkit-scrollbar-thumb { background: var(--border-default) !important; border-radius: 3px !important; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-strong) !important; }
`

const API_URL = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || '') : ''
const STORAGE_KEY = 'daya-studio-autosave'

const TEMPLATES = [
  { id: 'blank', label: 'Lienzo en blanco', icon: '⬜', content: '<div style="padding:40px;font-family:system-ui;color:#333;"><h1 style="font-size:42px;font-weight:700;margin:0 0 16px;">Título</h1><p style="font-size:18px;margin:0;color:#666;">Empieza a diseñar aquí...</p></div>' },
  { id: 'hero-section', label: 'Hero moderno', icon: '🌐', content: '<div style="width:100%;min-height:500px;background:linear-gradient(135deg,#0f172a,#1e293b);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;font-family:system-ui;position:relative;overflow:hidden;"><div style="position:absolute;top:-80px;right:-80px;width:300px;height:300px;background:radial-gradient(circle,rgba(109,92,255,0.15),transparent);border-radius:50%;"></div><h1 style="font-size:64px;font-weight:900;color:#fff;margin:0 0 16px;text-align:center;letter-spacing:-0.04em;line-height:1.05;">Construye el futuro</h1><p style="font-size:20px;color:#94a3b8;margin:0 0 32px;text-align:center;max-width:560px;line-height:1.6;">La plataforma que necesitas para tus ideas.</p><div style="display:flex;gap:16px;"><div style="padding:14px 28px;background:#6d5cff;border-radius:50px;color:#fff;font-weight:700;font-size:16px;cursor:pointer;">Comenzar</div><div style="padding:14px 28px;border:2px solid rgba(255,255,255,0.2);border-radius:50px;color:#fff;font-weight:600;font-size:16px;cursor:pointer;">Saber m&aacute;s</div></div></div>' },
  { id: 'social-post', label: 'Post Instagram', icon: '📱', content: '<div style="width:600px;height:600px;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;font-family:system-ui;"><h1 style="font-size:52px;font-weight:700;color:#fff;margin:0 0 12px;text-align:center;letter-spacing:-0.03em;">NUEVO LANZAMIENTO</h1><p style="font-size:20px;color:#94a3b8;margin:0 0 24px;text-align:center;">Descubre lo que viene</p><div style="padding:14px 36px;background:#6d5cff;border-radius:50px;color:#fff;font-weight:700;font-size:16px;cursor:pointer;">M&Aacute;S INFO</div></div>' },
  { id: 'linkedin-banner', label: 'LinkedIn banner', icon: '💼', content: '<div style="width:1128px;height:191px;background:linear-gradient(135deg,#0f172a,#1e293b);display:flex;align-items:center;justify-content:space-between;padding:0 48px;font-family:system-ui;"><div><h1 style="font-size:36px;font-weight:900;color:#fff;margin:0 0 4px;letter-spacing:-0.03em;">Tu Nombre</h1><p style="font-size:16px;color:#94a3b8;margin:0;">Especialista en · Dato · Producto · Dise&ntilde;o</p></div><div style="padding:10px 24px;background:#6d5cff;border-radius:50px;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">Conectar</div></div>' },
  { id: 'youtube-thumbnail', label: 'Miniatura YouTube', icon: '▶️', content: '<div style="width:1280px;height:720px;background:linear-gradient(135deg,#dc2626,#7c2d12);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;font-family:system-ui;position:relative;"><div style="position:absolute;bottom:40px;right:40px;width:80px;height:56px;background:#fff;border-radius:12px;display:flex;align-items:center;justify-content:center;"><div style="width:0;height:0;border-left:20px solid #dc2626;border-top:12px solid transparent;border-bottom:12px solid transparent;margin-left:4px;"></div></div><h1 style="font-size:64px;font-weight:900;color:#fff;margin:0;text-align:center;line-height:1.1;letter-spacing:-0.03em;max-width:800px;">COMO LLEGAR A SENIOR</h1></div>' },
  { id: 'sale-banner', label: 'Banner oferta', icon: '🏷️', content: '<div style="width:800px;height:300px;background:linear-gradient(135deg,#6d5cff,#a78bfa);display:flex;align-items:center;justify-content:space-between;padding:0 48px;font-family:system-ui;"><div><p style="font-size:18px;color:rgba(255,255,255,0.8);margin:0 0 4px;letter-spacing:0.05em;text-transform:uppercase;">Oferta limitada</p><h1 style="font-size:56px;font-weight:900;color:#fff;margin:0;line-height:1.1;letter-spacing:-0.03em;">50% OFF</h1></div><div style="padding:16px 32px;background:#fff;border-radius:50px;color:#6d5cff;font-weight:700;font-size:18px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.15);">COMPRAR</div></div>' },
  { id: 'product-card', label: 'Tarjeta producto', icon: '💳', content: '<div style="width:320px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1);font-family:system-ui;"><div style="height:180px;background:linear-gradient(135deg,#6d5cff,#ec4899);"></div><div style="padding:20px;"><div style="display:flex;gap:2px;margin-bottom:8px;font-size:16px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</div><h3 style="font-size:20px;font-weight:700;margin:0 0 6px;color:#0f172a;">Producto Premium</h3><p style="font-size:14px;color:#64748b;margin:0 0 16px;line-height:1.5;">Descripci&oacute;n breve del producto o servicio.</p><div style="display:flex;align-items:center;justify-content:space-between;"><span style="font-size:24px;font-weight:700;color:#6d5cff;">$99</span><div style="padding:10px 20px;background:#6d5cff;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">A&ntilde;adir</div></div></div></div>' },
  { id: 'pricing-table', label: 'Tabla precios', icon: '📊', content: '<div style="display:flex;gap:16px;padding:24px;font-family:system-ui;justify-content:center;"><div style="flex:1;max-width:240px;padding:24px;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center;"><h3 style="font-size:18px;font-weight:700;color:#0f172a;margin:0 0 8px;">B&aacute;sico</h3><p style="font-size:36px;font-weight:900;color:#6d5cff;margin:0 0 16px;">$19</p><ul style="list-style:none;padding:0;margin:0 0 20px;font-size:14px;color:#64748b;"><li style="padding:6px 0;">&#10003; 5 proyectos</li><li style="padding:6px 0;">&#10003; 10GB almacenaje</li><li style="padding:6px 0;">&#10003; Soporte email</li></ul><div style="padding:12px;border:2px solid #6d5cff;border-radius:8px;color:#6d5cff;font-weight:700;font-size:14px;cursor:pointer;">Elegir</div></div><div style="flex:1;max-width:240px;padding:24px;background:linear-gradient(135deg,#6d5cff,#a78bfa);border-radius:16px;color:#fff;text-align:center;"><h3 style="font-size:18px;font-weight:700;color:#fff;margin:0 0 8px;">Pro</h3><p style="font-size:36px;font-weight:900;margin:0 0 16px;">$49</p><ul style="list-style:none;padding:0;margin:0 0 20px;font-size:14px;opacity:0.9;"><li style="padding:6px 0;">&#10003; Proyectos ilimitados</li><li style="padding:6px 0;">&#10003; 100GB almacenaje</li><li style="padding:6px 0;">&#10003; Soporte prioritario</li></ul><div style="padding:12px;background:#fff;border-radius:8px;color:#6d5cff;font-weight:700;font-size:14px;cursor:pointer;">Elegir</div></div></div>' },
  { id: 'testimonial', label: 'Testimonial', icon: '💬', content: '<div style="max-width:480px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);text-align:center;font-family:system-ui;"><div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#6d5cff,#ec4899);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:28px;">M</div><p style="font-size:18px;font-style:italic;color:#334155;line-height:1.7;margin:0 0 16px;">"Daya transform&oacute; la forma en que trabajamos."</p><p style="font-size:15px;font-weight:700;color:#0f172a;margin:0;">Mar&iacute;a Garc&iacute;a</p><p style="font-size:13px;color:#94a3b8;margin:4px 0 0;">CEO, TechCorp</p></div>' },
  { id: 'presentation-cover', label: 'Portada presentación', icon: '📽️', content: '<div style="width:960px;height:540px;background:linear-gradient(160deg,#0f172a,#1e293b);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;font-family:system-ui;"><div style="width:80px;height:4px;background:#6d5cff;border-radius:2px;margin-bottom:24px;"></div><h1 style="font-size:56px;font-weight:700;color:#fff;margin:0 0 12px;text-align:center;letter-spacing:-0.03em;">Informe Anual 2026</h1><p style="font-size:22px;color:#94a3b8;margin:0 0 32px;text-align:center;">Resultados y perspectivas</p><p style="font-size:14px;color:#64748b;text-align:center;">Tu Nombre &middot; Empresa</p></div>' },
  { id: 'certificate', label: 'Certificado', icon: '🏆', content: '<div style="width:800px;height:560px;background:#fffbeb;border:3px solid #d4a574;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;font-family:system-ui;"><p style="font-size:14px;letter-spacing:0.15em;text-transform:uppercase;color:#92400e;margin:0 0 8px;">&#9733; Certificado de finalizaci&oacute;n &#9733;</p><p style="font-size:18px;color:#92400e;margin:0 0 4px;">Se otorga a</p><h1 style="font-size:48px;font-weight:700;color:#78350f;margin:0 0 8px;letter-spacing:-0.02em;">Nombre del Participante</h1><p style="font-size:18px;color:#92400e;margin:0 0 4px;">por completar con &eacute;xito el curso de</p><h2 style="font-size:26px;font-weight:600;color:#78350f;margin:0 0 24px;">"Marketing Digital Avanzado"</h2><p style="font-size:14px;color:#92400e;margin:0;">Fecha: Julio 2026 &middot; 40 horas</p></div>' },
  { id: 'business-card', label: 'Tarjeta visita', icon: '🪪', content: '<div style="width:420px;height:240px;background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px;padding:32px;display:flex;flex-direction:column;justify-content:space-between;font-family:system-ui;"><div><div style="width:40px;height:40px;border-radius:10px;background:#6d5cff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:20px;">D</div></div><div><h2 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 2px;">Ana Mart&iacute;nez</h2><p style="font-size:14px;color:#94a3b8;margin:0 0 4px;">Directora de Dise&ntilde;o</p><p style="font-size:13px;color:#64748b;margin:0;">ana@daya.ai &middot; @anamartinez</p></div></div>' },
  { id: 'newsletter-email', label: 'Email newsletter', icon: '📧', content: '<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;font-family:system-ui;"><div style="padding:36px 28px;background:#0f172a;text-align:center;"><h1 style="font-size:28px;font-weight:700;color:#fff;margin:0 0 6px;">Bolet&iacute;n Mensual</h1><p style="font-size:14px;color:#94a3b8;margin:0;">Julio 2026</p></div><div style="padding:28px;color:#334155;font-size:16px;line-height:1.7;">Hola {{nombre}},<br><br>Este mes traemos novedades incre&iacute;bles para ti.<br><br><div style="padding:20px;background:#f8fafc;border-radius:12px;border-left:4px solid #6d5cff;margin:20px 0;"><strong style="font-size:18px;">Novedad destacada</strong><br>Descripci&oacute;n de la novedad del mes.</div></div></div>' },
  { id: 'event-flyer', label: 'Flyer evento', icon: '🎫', content: '<div style="width:500px;background:#09090b;border-radius:16px;overflow:hidden;font-family:system-ui;"><div style="height:280px;background:linear-gradient(135deg,rgba(109,92,255,0.3),rgba(236,72,153,0.2));display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;"><p style="font-size:13px;letter-spacing:0.15em;text-transform:uppercase;color:#a78bfa;margin:0 0 8px;">S&aacute;bado 12 Jul &middot; 21:00</p><h1 style="font-size:64px;font-weight:900;color:#fff;margin:0;text-align:center;line-height:1.1;letter-spacing:-0.03em;">JAZZ NIGHT</h1></div><div style="padding:24px;display:flex;justify-content:space-between;align-items:center;"><p style="font-size:14px;color:#94a3b8;margin:0;">Club Azul &middot; Barcelona</p><div style="padding:10px 24px;background:#6d5cff;border-radius:50px;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">RESERVAR</div></div></div>' },
  { id: 'blog-post', label: 'Post blog', icon: '📝', content: '<div style="max-width:680px;padding:40px;font-family:system-ui;background:#fff;"><div style="width:100%;height:280px;background:linear-gradient(135deg,#6d5cff,#a78bfa);border-radius:16px;margin-bottom:24px;"></div><div style="display:flex;gap:8px;margin-bottom:16px;"><span style="padding:4px 12px;border-radius:50px;font-size:12px;font-weight:700;background:#ede9fe;color:#6d5cff;">Tecnolog&iacute;a</span><span style="padding:4px 12px;border-radius:50px;font-size:12px;font-weight:700;background:#f1f5f9;color:#475569;">6 min lectura</span></div><h1 style="font-size:34px;font-weight:800;color:#0f172a;margin:0 0 12px;line-height:1.2;letter-spacing:-0.03em;">C&oacute;mo la IA transforma el dise&ntilde;o</h1><p style="font-size:16px;color:#64748b;line-height:1.7;margin:0 0 20px;">La inteligencia artificial est&aacute; revolucionando la forma en que creamos. Desde generaci&oacute;n autom&aacute;tica de layouts...</p><p style="font-size:14px;color:#94a3b8;margin:0;">Por Ana Mart&iacute;nez &middot; 15 Jul 2026</p></div>' },
  { id: 'feature-grid', label: 'Grid features', icon: '✨', content: '<div style="padding:48px;background:#f8fafc;font-family:system-ui;"><h2 style="font-size:32px;font-weight:800;color:#0f172a;text-align:center;margin:0 0 8px;letter-spacing:-0.03em;">Todo lo que necesitas</h2><p style="font-size:16px;color:#64748b;text-align:center;margin:0 0 32px;">Construido para equipos modernos</p><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;"><div style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);"><div style="width:40px;height:40px;border-radius:10px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px;">&#9889;</div><h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">R&aacute;pido</h3><p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">Optimizado para velocidad.</p></div><div style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);"><div style="width:40px;height:40px;border-radius:10px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px;">&#128274;</div><h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">Seguro</h3><p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">Datos protegidos siempre.</p></div><div style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.04);"><div style="width:40px;height:40px;border-radius:10px;background:#ede9fe;display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:12px;">&#127912;</div><h3 style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 6px;">Flexible</h3><p style="font-size:13px;color:#64748b;margin:0;line-height:1.6;">Todo a tu medida.</p></div></div></div>' },
  { id: 'coming-soon', label: 'Próximamente', icon: '🚀', content: '<div style="width:100%;min-height:400px;background:linear-gradient(135deg,#0f172a,#1e293b);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;font-family:system-ui;text-align:center;"><div style="font-size:64px;margin-bottom:16px;">&#128640;</div><h1 style="font-size:48px;font-weight:900;color:#fff;margin:0 0 8px;letter-spacing:-0.03em;">Pr&oacute;ximamente</h1><p style="font-size:18px;color:#94a3b8;margin:0 0 24px;max-width:400px;">Algo incre&iacute;ble est&aacute; en camino.</p><div style="display:flex;gap:8px;max-width:400px;width:100%;"><input type="email" placeholder="tu@email.com" style="flex:1;padding:12px 16px;border-radius:8px;border:none;font-size:15px;outline:none;font-family:system-ui;" /><div style="padding:12px 24px;background:#6d5cff;border-radius:8px;color:#fff;font-weight:700;font-size:15px;cursor:pointer;white-space:nowrap;">Notificarme</div></div></div>' },
]

const BLOCK_CATEGORIES = [
  {
    name: 'Texto',
    blocks: [
      { id: 'heading', label: 'Título', content: '<h1 style="padding:10px 16px;font-size:42px;font-weight:700;margin:0;font-family:var(--font-body);letter-spacing:-0.03em;line-height:1.2;">Título principal</h1>', category: 'Texto' },
      { id: 'subheading', label: 'Subtítulo', content: '<h2 style="padding:8px 16px;font-size:28px;font-weight:600;margin:0;font-family:var(--font-body);color:#475569;letter-spacing:-0.02em;line-height:1.3;">Subtítulo aquí</h2>', category: 'Texto' },
      { id: 'text', label: 'Párrafo', content: '<p style="padding:8px 16px;font-size:16px;line-height:1.7;margin:0;font-family:var(--font-body);color:#334155;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>', category: 'Texto' },
      { id: 'quote', label: 'Cita', content: '<blockquote style="padding:16px 20px;margin:0;border-left:4px solid #6d5cff;background:#f8fafc;border-radius:0 8px 8px 0;font-family:var(--font-body);"><p style="font-size:18px;font-style:italic;color:#334155;margin:0 0 8px;">"El diseño es donde la ciencia y el arte se equilibran."</p><cite style="font-size:14px;color:#64748b;font-style:normal;font-weight:600;">— Autor</cite></blockquote>', category: 'Texto' },
      { id: 'list', label: 'Lista', content: '<ul style="padding:8px 16px 8px 40px;margin:0;font-family:var(--font-body);"><li style="font-size:16px;color:#334155;line-height:1.8;">Primer elemento</li><li style="font-size:16px;color:#334155;line-height:1.8;">Segundo elemento</li><li style="font-size:16px;color:#334155;line-height:1.8;">Tercer elemento</li></ul>', category: 'Texto' },
    ],
  },
  {
    name: 'Medios',
    blocks: [
      { id: 'image', label: 'Imagen', select: true, content: { type: 'image' }, activate: true, category: 'Medios' },
      { id: 'video', label: 'Video', select: true, content: { type: 'video' }, category: 'Medios' },
      { id: 'icon-check', label: 'Icono check', content: '<div style="display:flex;align-items:center;gap:12px;padding:8px 16px;font-family:var(--font-body);"><div style="width:32px;height:32px;border-radius:50%;background:#6d5cff;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">✓</div><span style="font-size:16px;color:#334155;">Característica destacada</span></div>', category: 'Medios' },
      { id: 'divider', label: 'Separador', content: '<hr style="border:none;border-top:2px solid #e2e8f0;margin:16px;width:calc(100% - 32px);" />', category: 'Medios' },
      { id: 'spacer', label: 'Espaciador', content: '<div style="height:40px;width:100%;"></div>', category: 'Medios' },
    ],
  },
  {
    name: 'Componentes',
    blocks: [
      { id: 'button', label: 'Botón', content: '<a style="display:inline-block;padding:14px 32px;background:#6d5cff;color:#fff;border-radius:50px;text-decoration:none;font-weight:700;font-size:16px;cursor:pointer;text-align:center;font-family:var(--font-body);">Botón</a>', category: 'Componentes' },
      { id: 'button-outline', label: 'Botón outline', content: '<a style="display:inline-block;padding:14px 32px;border:2px solid #6d5cff;color:#6d5cff;border-radius:50px;text-decoration:none;font-weight:700;font-size:16px;cursor:pointer;text-align:center;font-family:var(--font-body);">Botón</a>', category: 'Componentes' },
      { id: 'card-simple', label: 'Tarjeta simple', content: '<div style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.08);font-family:var(--font-body);"><h3 style="font-size:20px;font-weight:700;margin:0 0 8px;color:#0f172a;">Título</h3><p style="font-size:14px;color:#64748b;margin:0;line-height:1.6;">Contenido de la tarjeta. Puedes editar este texto.</p></div>', category: 'Componentes' },
      { id: 'badge', label: 'Etiqueta', content: '<span style="display:inline-block;padding:4px 12px;border-radius:50px;font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;background:#ede9fe;color:#6d5cff;font-family:var(--font-body);">Nuevo</span>', category: 'Componentes' },
      { id: 'tag', label: 'Tag', content: '<span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:13px;font-weight:600;background:#f1f5f9;color:#475569;margin:2px;font-family:var(--font-body);">Tag</span>', category: 'Componentes' },
      { id: 'avatar', label: 'Avatar', content: '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#6d5cff,#ec4899);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px;">D</div>', category: 'Componentes' },
      { id: 'progress', label: 'Barra progreso', content: '<div style="padding:8px 16px;font-family:var(--font-body);"><div style="display:flex;justify-content:space-between;font-size:13px;color:#64748b;margin-bottom:6px;"><span>Progreso</span><span>75%</span></div><div style="width:100%;height:8px;border-radius:4px;background:#e2e8f0;overflow:hidden;"><div style="width:75%;height:100%;border-radius:4px;background:linear-gradient(90deg,#6d5cff,#a78bfa);"></div></div></div>', category: 'Componentes' },
    ],
  },
  {
    name: 'Layout',
    blocks: [
      { id: 'container', label: 'Contenedor', content: '<div style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);min-height:100px;"></div>', category: 'Layout' },
      { id: 'columns-2', label: '2 columnas', content: '<div style="display:flex;gap:16px;padding:16px;"><div style="flex:1;padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="flex:1;padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div></div>', category: 'Layout' },
      { id: 'columns-3', label: '3 columnas', content: '<div style="display:flex;gap:12px;padding:16px;"><div style="flex:1;padding:12px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="flex:1;padding:12px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="flex:1;padding:12px;background:#f8fafc;border-radius:8px;min-height:80px;"></div></div>', category: 'Layout' },
      { id: 'section', label: 'Sección', content: '<section style="padding:40px 24px;background:#f8fafc;min-height:200px;"></section>', category: 'Layout' },
      { id: 'grid-2x2', label: 'Grid 2×2', content: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px;"><div style="padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div><div style="padding:16px;background:#f8fafc;border-radius:8px;min-height:80px;"></div></div>', category: 'Layout' },
      { id: 'navbar', label: 'Barra navegación', content: '<nav style="display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:#fff;border-bottom:1px solid #e2e8f0;font-family:var(--font-body);"><span style="font-weight:700;font-size:18px;color:#0f172a;">Logo</span><div style="display:flex;gap:20px;"><span style="font-size:14px;color:#64748b;cursor:pointer;">Inicio</span><span style="font-size:14px;color:#64748b;cursor:pointer;">Servicios</span><span style="font-size:14px;color:#64748b;cursor:pointer;">Contacto</span></div></nav>', category: 'Layout' },
      { id: 'footer', label: 'Footer', content: '<footer style="padding:24px;background:#0f172a;color:#94a3b8;text-align:center;font-family:var(--font-body);font-size:14px;">© 2026 Tu Empresa. Todos los derechos reservados.</footer>', category: 'Layout' },
    ],
  },
  {
    name: 'Formulario',
    blocks: [
      { id: 'input', label: 'Campo texto', content: '<div style="padding:8px 16px;font-family:var(--font-body);"><label style="display:block;font-size:14px;font-weight:600;color:#334155;margin-bottom:6px;">Etiqueta</label><input type="text" placeholder="Escribe aquí..." style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;box-sizing:border-box;font-family:var(--font-body);" /></div>', category: 'Formulario' },
      { id: 'textarea', label: 'Área texto', content: '<div style="padding:8px 16px;font-family:var(--font-body);"><label style="display:block;font-size:14px;font-weight:600;color:#334155;margin-bottom:6px;">Mensaje</label><textarea placeholder="Escribe tu mensaje..." style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:15px;outline:none;min-height:100px;resize:vertical;box-sizing:border-box;font-family:var(--font-body);"></textarea></div>', category: 'Formulario' },
      { id: 'form', label: 'Formulario', content: '<form style="padding:24px;background:#fff;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.06);font-family:var(--font-body);max-width:400px;"><h3 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0f172a;">Contacto</h3><div style="margin-bottom:12px;"><input type="text" placeholder="Nombre" style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;font-family:var(--font-body);" /></div><div style="margin-bottom:12px;"><input type="email" placeholder="Email" style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;font-family:var(--font-body);" /></div><div style="margin-bottom:12px;"><textarea placeholder="Mensaje" rows={3} style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;font-family:var(--font-body);resize:vertical;"></textarea></div><button type="submit" style="width:100%;padding:12px;background:#6d5cff;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;font-family:var(--font-body);">Enviar</button></form>', category: 'Formulario' },
    ],
  },
]

// ── Helpers ──

function saveToStorage(html: string, css: string) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ html, css, savedAt: Date.now() })) } catch { /* noop */ }
}

function loadFromStorage(): { html: string; css: string; savedAt: number } | null {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return null; return JSON.parse(raw) } catch { return null }
}

function pollinationsUrl(prompt: string, style = 'realistic'): string {
  const safe = encodeURIComponent(prompt.slice(0, 500))
  const seed = Math.floor(Math.random() * 100000)
  const cfg = style === 'illustration' ? '&cfg=7' : '&cfg=3.5'
  return `https://image.pollinations.ai/prompt/${safe}?seed=${seed}&width=1024&height=1024${cfg}`
}

function readSSE<T = unknown>(reader: ReadableStreamDefaultReader<Uint8Array>, onData: (d: T) => void, onDone: () => void) {
  const decoder = new TextDecoder()
  let buf = ''
  function pump() {
    reader.read().then(({ done, value }) => {
      if (done) { onDone(); return }
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const m = line.match(/^data:\s*(.+)/)
        if (m) {
          try { onData(JSON.parse(m[1])) }
          catch { /* ignore malformed */ }
        }
      }
      pump()
    }).catch(() => onDone())
  }
  pump()
}

// ── Main Page ──

export default function StudioPage() {
  const { isAuthenticated, hasHydrated } = useAuthStore()
  const router = useRouter()
  const editorRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [editorReady, setEditorReady] = useState(false)
  const [rightTab, setRightTab] = useState<'styles' | 'ai' | 'export' | 'templates' | 'images'>('styles')
  const [zoom, setZoom] = useState(100)
  const [loading, setLoading] = useState(true)
  const [blockFilter, setBlockFilter] = useState('')
  const [canvBg, setCanvBg] = useState('#ffffff')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const restoreAttempted = useRef(false)

  useEffect(() => {
    if (!hasHydrated) return
    if (!isAuthenticated()) { router.push('/auth/login'); return }
    document.title = 'Daya Studio'

    let cancelled = false

    async function init() {
      const grapesjs = (await import('grapesjs')).default
      await import('grapesjs/dist/css/grapes.min.css')

      if (cancelled || !containerRef.current) return

      const allBlocks = BLOCK_CATEGORIES.flatMap(c => c.blocks)

      const editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        storageManager: false,
        undoManager: { trackSelection: false },
        selectorManager: { appendTo: '#gjs-selectors' } as any,
        styleManager: {
          appendTo: '#gjs-styles',
          sectors: [
            { name: 'Dimension', open: true, buildProps: ['width', 'height', 'min-height', 'max-width', 'padding', 'margin', 'display'] },
            { name: 'Typography', open: true, buildProps: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'text-align', 'line-height', 'text-shadow'] },
            { name: 'Decorations', open: true, buildProps: ['border-radius', 'border', 'box-shadow', 'background-color', 'background', 'opacity'] },
            { name: 'Extra', open: false, buildProps: ['position', 'top', 'left', 'right', 'bottom', 'transform', 'transition'] },
          ],
        } as any,
        traitManager: { appendTo: '#gjs-traits' } as any,
        layerManager: { appendTo: '#gjs-layers' } as any,
        blockManager: { appendTo: '#gjs-blocks', blocks: allBlocks } as any,
        canvas: { styles: ['https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap'] },
        panels: { defaults: [] },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px', widthMedia: '768px' },
            { name: 'Móvil', width: '375px', widthMedia: '480px' },
          ],
        },
        assetManager: {
          embedAsBase64: true,
        } as any,
      } as any)

      if (cancelled) { editor.destroy(); return }

      editorRef.current = editor

      // ── Autosave ──
      const h = () => editor.getHtml() || ''
      const c = () => editor.getCss() || ''
      editor.on('component:update', () => { saveToStorage(h(), c()) })
      editor.on('component:add', () => { saveToStorage(h(), c()) })
      editor.on('component:remove', () => { saveToStorage(h(), c()) })

      // ── Restore or load blank ──
      const restored = loadFromStorage()
      if (restored && !restoreAttempted.current) {
        restoreAttempted.current = true
        if (window.confirm(`Restaurar sesi\u00f3n anterior (${Math.round((Date.now() - restored.savedAt) / 60000)} min)?`)) {
          editor.setStyle(restored.css); editor.addComponents(restored.html)
        } else {
          localStorage.removeItem(STORAGE_KEY)
          const blank = TEMPLATES.find(t => t.id === 'blank')
          if (blank) editor.addComponents(blank.content)
        }
      } else {
        const blank = TEMPLATES.find(t => t.id === 'blank')
        if (blank) editor.addComponents(blank.content)
      }

      // ── Panels ──
      const pn = editor.Panels
      pn.addPanel({ id: 'panel-top', el: '.gjs-pn-top' })
      pn.addPanel({ id: 'basic-actions', el: '.gjs-pn-actions', buttons: [
        { id: 'visibility', active: true, className: 'btn-toggle-borders', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>', command: 'sw-visibility' },
        { id: 'fullscreen', className: 'btn-fullscreen', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>', command: 'core:fullscreen' },
        { id: 'undo', className: 'btn-undo', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>', command: 'core:undo' },
        { id: 'redo', className: 'btn-redo', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>', command: 'core:redo' },
        { id: 'export', className: 'btn-export', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>', command: 'export-template' },
        { id: 'clear', className: 'btn-clear', label: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', command: 'core:canvas-clear' },
      ]})

      // ── Align commands ──
      editor.Commands.add('align-left', { run(ed: any) { const s = ed.getSelected(); if (!s) return; s.setStyle({ left: 0 }) } })
      editor.Commands.add('align-center', { run(ed: any) { const s = ed.getSelected(); if (!s) return; const p = s.parent(); if (!p) return; const pw = parseInt(p.getStyle().width) || 900; const sw = parseInt(s.getStyle().width) || 100; s.setStyle({ left: Math.round((pw - sw) / 2) }) } })
      editor.Commands.add('align-right', { run(ed: any) { const s = ed.getSelected(); if (!s) return; const p = s.parent(); if (!p) return; const pw = parseInt(p.getStyle().width) || 900; const sw = parseInt(s.getStyle().width) || 100; s.setStyle({ left: pw - sw }) } })
      editor.Commands.add('align-top', { run(ed: any) { const s = ed.getSelected(); if (!s) return; s.setStyle({ top: 0 }) } })
      editor.Commands.add('align-bottom', { run(ed: any) { const s = ed.getSelected(); if (!s) return; const p = s.parent(); if (!p) return; const ph = parseInt(p.getStyle().height) || 600; const sh = parseInt(s.getStyle().height) || 100; s.setStyle({ top: ph - sh }) } })

      // ── Export commands ──
      editor.Commands.add('export-template', {
        run(ed: any) {
          const html = ed.getHtml()
          const css = ed.getCss()
          const full = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${html}</body></html>`
          const blob = new Blob([full], { type: 'text/html' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = 'daya-export.html'
          a.click()
        },
      })

      const exportImageCmd = (format: 'png' | 'jpeg') => ({
        async run(ed: any) {
          const h2c = (await import('html2canvas')).default
          const w = ed.Canvas.getFrameEl()?.contentDocument?.body
          if (!w) return
          const ob = w.style.background; w.style.background = '#fff'
          const c = await h2c(w, { useCORS: true, allowTaint: false, backgroundColor: '#ffffff', scale: 2 })
          w.style.background = ob
          const a = document.createElement('a')
          a.href = format === 'png' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92)
          a.download = `daya-export.${format}`; a.click()
        },
      })
      editor.Commands.add('export-png', exportImageCmd('png'))
      editor.Commands.add('export-jpg', exportImageCmd('jpeg'))

      editor.Commands.add('export-pdf', {
        async run(ed: any) {
          const { default: jspdf } = await import('jspdf')
          const h2c = (await import('html2canvas')).default
          const w = ed.Canvas.getFrameEl()?.contentDocument?.body
          if (!w) return
          const ob = w.style.background; w.style.background = '#fff'
          const c = await h2c(w, { useCORS: true, allowTaint: false, backgroundColor: '#ffffff', scale: 2 })
          w.style.background = ob
          const pdf = new jspdf({ orientation: c.width > c.height ? 'landscape' : 'portrait' })
          pdf.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, pdf.internal.pageSize.getWidth(), (c.height / c.width) * pdf.internal.pageSize.getWidth())
          pdf.save('daya-export.pdf')
        },
      })

      // ── Template loaders ──
      for (const tpl of TEMPLATES) {
        editor.Commands.add(`load-template-${tpl.id}`, {
          run(ed: any) {
            ed.runCommand('core:canvas-clear')
            ed.setStyle('')
            ed.addComponents(tpl.content)
          },
        })
      }

      editor.on('load', () => {
        editor.setDevice('Desktop')
        setLoading(false)
        setEditorReady(true)
      })

      // ── Zoom sync ──
      const checkZoom = () => {
        if (!editorRef.current) return
        setZoom(Math.round(editorRef.current.Canvas.getZoom() * 100))
      }
      editor.on('canvas:update', checkZoom)
    }

    init()
    return () => { cancelled = true; editorRef.current?.destroy() }
  }, [hasHydrated, isAuthenticated, router])

  const handleZoomIn = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const z = ed.Canvas.getZoom()
    ed.Canvas.setZoom(Math.min(z + 0.1, 3))
    setZoom(Math.round((z + 0.1) * 100))
  }, [])

  const handleZoomOut = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    const z = ed.Canvas.getZoom()
    ed.Canvas.setZoom(Math.max(z - 0.1, 0.3))
    setZoom(Math.round((z - 0.1) * 100))
  }, [])

  const handleZoomReset = useCallback(() => {
    const ed = editorRef.current
    if (!ed) return
    ed.Canvas.setZoom(1)
    setZoom(100)
  }, [])

  const handleCanvBg = useCallback((color: string) => {
    setCanvBg(color)
    const frame = editorRef.current?.Canvas.getFrameEl()
    if (frame) frame.contentDocument.body.style.background = color
  }, [])

  const runCmd = useCallback((cmd: string) => { editorRef.current?.runCommand(cmd) }, [])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    if (!editorReady) return
    const ed = editorRef.current
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ed?.runCommand('core:component-delete') }
      if (e.ctrlKey && e.key === 'd') { e.preventDefault(); ed?.runCommand('core:component-duplicate') }
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); ed?.runCommand('export-template') }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [editorReady])

  // ── Right-click context menu ──
  useEffect(() => {
    if (!editorReady) return
    function handleCtx(e: MouseEvent) { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }
    function handleClick() { setContextMenu(null) }
    containerRef.current?.addEventListener('contextmenu', handleCtx)
    window.addEventListener('click', handleClick)
    return () => { containerRef.current?.removeEventListener('contextmenu', handleCtx); window.removeEventListener('click', handleClick) }
  }, [editorReady])

  if (!hasHydrated || !isAuthenticated()) return null

  // ── Splash screen ──
  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', flexDirection: 'column', gap: 24 }}>
        <style>{`@keyframes studioPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.05); } }`}</style>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'studioPulse 1.8s ease-in-out infinite' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Daya Studio</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Cargando editor visual...</span>
        </div>
      </div>
    )
  }

  const filteredBlocks = blockFilter
    ? BLOCK_CATEGORIES.flatMap(c => c.blocks).filter(b =>
        b.label.toLowerCase().includes(blockFilter.toLowerCase()) ||
        b.id.toLowerCase().includes(blockFilter.toLowerCase())
      )
    : null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-base)' }}>
      <style>{GJ_THEME}</style>
      {/* Context menu */}
      {contextMenu && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 9999, background: 'var(--bg-surface)', border: '1px solid var(--border-strong)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.3)', padding: 4, minWidth: 160, fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>
          <button onClick={() => { runCmd('core:component-duplicate'); setContextMenu(null) }} style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>Duplicar</button>
          <button onClick={() => { runCmd('core:component-delete'); setContextMenu(null) }} style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>Eliminar</button>
          <div style={{ height: 1, background: 'var(--border-default)', margin: '4px 0' }} />
          <button onClick={() => { runCmd('align-center'); setContextMenu(null) }} style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>Centrar</button>
          <button onClick={() => { runCmd('align-bottom'); setContextMenu(null) }} style={{ display: 'block', width: '100%', padding: '6px 12px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', borderRadius: 4, fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>Alinear abajo</button>
        </div>
      )}
      {/* Barra superior */}
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Daya" style={{ width: 22, height: 22, objectFit: 'contain', filter: 'var(--logo-filter)' }} />
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>Studio</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', background: 'var(--bg-base)', padding: '2px 8px', borderRadius: 4, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>beta</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', opacity: 0.6 }}>—</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', opacity: 0.6 }}>Arrastra bloques al lienzo</span>
        </div>
        <div className="gjs-pn-top" style={{ display: 'flex', alignItems: 'center', gap: 4 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Align tools */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--bg-base)', borderRadius: 6, padding: '2px' }}>
            {[
              { id: 'align-left', h: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>', t: 'Izquierda' },
              { id: 'align-center', h: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="6" x2="3" y2="6"/><line x1="12" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="3" y2="14"/><line x1="12" y1="18" x2="21" y2="18"/></svg>', t: 'Centrar' },
              { id: 'align-right', h: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="7" y1="10" x2="21" y2="10"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="7" y1="14" x2="21" y2="14"/><line x1="3" y1="18" x2="21" y2="18"/></svg>', t: 'Derecha' },
              { id: 'align-top', h: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="3" x2="14" y2="3"/><line x1="12" y1="3" x2="12" y2="21"/></svg>', t: 'Arriba' },
              { id: 'align-bottom', h: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="21" x2="14" y2="21"/><line x1="12" y1="3" x2="12" y2="21"/></svg>', t: 'Abajo' },
            ].map(b => (
              <button key={b.id} onClick={() => runCmd(b.id)} title={b.t} style={{ padding: '4px 6px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', borderRadius: 4, display: 'flex', alignItems: 'center', lineHeight: 1 }} dangerouslySetInnerHTML={{ __html: b.h }} />
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />
          {/* Canvas bg color */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-base)', borderRadius: 6, padding: '2px 6px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', fontWeight: 600 }}>Fondo:</span>
            <input type="color" value={canvBg} onChange={e => handleCanvBg(e.target.value)} style={{ width: 22, height: 22, padding: 0, border: '1px solid var(--border-default)', borderRadius: 4, cursor: 'pointer', background: 'none' }} />
          </div>
          <div style={{ width: 1, height: 20, background: 'var(--border-default)' }} />
          {/* Zoom controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-base)', borderRadius: 6, padding: '2px' }}>
            <button onClick={handleZoomOut} title="Alejar" style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, borderRadius: 4, display: 'flex', alignItems: 'center' }}>−</button>
            <button onClick={handleZoomReset} title="Restablecer zoom" style={{ padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600, fontFamily: 'var(--font-body)', minWidth: 40, textAlign: 'center', lineHeight: 1 }}>{zoom}%</button>
            <button onClick={handleZoomIn} title="Acercar" style={{ padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '16px', lineHeight: 1, borderRadius: 4, display: 'flex', alignItems: 'center' }}>+</button>
          </div>
          <div className="gjs-pn-actions" style={{ display: 'flex', alignItems: 'center', gap: 4 }} />
        </div>
      </div>

      {/* Layout principal */}
      <div style={{ display: 'flex', flex: 1, marginTop: 44 }}>
        {/* Barra lateral izquierda */}
        <div style={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          {/* Tabs izquierdos */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
            {(['blocks', 'layers'] as const).map(tab => (
              <button key={tab} onClick={() => setRightTab(tab === 'blocks' ? 'styles' : 'ai')} style={{ flex: 1, padding: '8px 0', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '2px solid transparent', opacity: 0.6 }}>{tab === 'blocks' ? 'Componentes' : 'Capas'}</button>
            ))}
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-default)' }}>
            <input value={blockFilter} onChange={e => setBlockFilter(e.target.value)} placeholder="Buscar bloques..." style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div id="gjs-blocks" style={{ padding: '8px 10px', display: blockFilter ? 'none' : 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, borderBottom: '1px solid var(--border-default)', maxHeight: '35%', overflow: 'auto' }} />
          {blockFilter && (
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)', maxHeight: '35%', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {(filteredBlocks || []).map(b => (
                <div key={b.id} onClick={() => editorRef.current?.runCommand('core:component-add', { type: b.id })} style={{ padding: '8px 6px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                  {b.label}
                </div>
              ))}
              {filteredBlocks?.length === 0 && <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.75rem', padding: 12 }}>Sin resultados</div>}
            </div>
          )}
          <div style={{ flex: 1, padding: '8px 10px', overflow: 'auto' }}>
            <div id="gjs-layers" />
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', background: 'var(--bg-base)' }} />

        {/* Barra lateral derecha */}
        <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-default)' }}>
            {[
              { id: 'styles', label: 'Estilos', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>' },
              { id: 'export', label: 'Exportar', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
              { id: 'templates', label: 'Plantillas', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
              { id: 'ai', label: 'IA', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4c0 2-2 3-4 5-2-2-4-3-4-5a4 4 0 0 1 4-4z"/><path d="M8 14h8"/><path d="M8 18h4"/><path d="M8 22h8"/></svg>' },
              { id: 'images', label: 'Imágenes', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setRightTab(tab.id as any)} style={{ flex: 1, padding: '8px 0', border: 'none', background: rightTab === tab.id ? 'var(--bg-elevated)' : 'transparent', color: rightTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)', letterSpacing: '0.06em', textTransform: 'uppercase', borderBottom: rightTab === tab.id ? '2px solid var(--brand)' : '2px solid transparent', transition: 'all 0.1s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, lineHeight: 1.2 }}>
                <span dangerouslySetInnerHTML={{ __html: tab.icon }} />
                {tab.label}
              </button>
            ))}
          </div>
          {rightTab === 'styles' && <StylesPanel />}
          {rightTab === 'export' && <ExportPanel editor={editorRef.current} />}
          {rightTab === 'templates' && <TemplatePanel editor={editorRef.current} />}
          {rightTab === 'ai' && <StudioAgentPanel editor={editorRef.current} />}
          {rightTab === 'images' && <ImageSearchPanel editor={editorRef.current} />}
        </div>
      </div>
    </div>
  )
}

function StylesPanel() {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
      <div id="gjs-selectors" style={{ marginBottom: 8 }} />
      <div id="gjs-styles" />
      <div id="gjs-traits" style={{ marginTop: 8 }} />
    </div>
  )
}

function ExportPanel({ editor }: { editor: any }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Exportar diseño</div>
      <button onClick={() => editor?.runCommand('export-template')} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}>
        <span style={{ fontSize: 18 }}>📄</span>
        <div><div>HTML</div><div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>Página web completa</div></div>
      </button>
      <button onClick={() => editor?.runCommand('export-png')} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}>
        <span style={{ fontSize: 18 }}>🖼️</span>
        <div><div>PNG</div><div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>Imagen PNG (2×)</div></div>
      </button>
      <button onClick={() => editor?.runCommand('export-jpg')} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}>
        <span style={{ fontSize: 18 }}>🖼️</span>
        <div><div>JPG</div><div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>Imagen JPEG (alta calidad)</div></div>
      </button>
      <button onClick={() => editor?.runCommand('export-pdf')} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.12s' }}>
        <span style={{ fontSize: 18 }}>📕</span>
        <div><div>PDF</div><div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 400 }}>Documento PDF</div></div>
      </button>
      <div style={{ marginTop: 16, fontSize: '0.68rem', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-default)', paddingTop: 12, lineHeight: 1.6 }}>
        <strong>Atajos de teclado:</strong><br />
        Ctrl+Z — Deshacer &middot; Ctrl+Shift+Z — Rehacer<br />
        Ctrl+S — Exportar HTML &middot; Supr — Eliminar<br />
        Ctrl+D — Duplicar &middot; Clic der. — Men&uacute;
      </div>
      <div style={{ marginTop: 'auto', fontSize: '0.62rem', color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.5, padding: '8px 0' }}>
        Editor visual basado en <a href="https://grapesjs.com" target="_blank" rel="noopener" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>GrapesJS</a> (BSD license)
      </div>
    </div>
  )
}

function TemplatePanel({ editor }: { editor: any }) {
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Plantillas</div>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: 8 }}>Selecciona una plantilla para empezar:</div>
      {TEMPLATES.map(tpl => (
        <button key={tpl.id} onClick={() => editor?.runCommand(`load-template-${tpl.id}`)} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{tpl.icon}</span>
          {tpl.label}
        </button>
      ))}
    </div>
  )
}

function StudioAgentPanel({ editor }: { editor: any }) {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const token = useAuthStore(s => s.token)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = () => {
    const text = input.trim()
    if (!text || busy || !token) return
    setInput('')
    const userMsg: { role: string; content: string } = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setBusy(true)

    const history = messages.slice(-20).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    let aiContent = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const updateLast = (content: string) => {
      setMessages(prev => {
        const next = [...prev]
        if (next.length > 0) next[next.length - 1] = { role: 'assistant', content }
        return next
      })
    }

    fetch(`${API_URL}/api/studio/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: text, history }),
    }).then(async res => {
      if (!res.ok) { updateLast('Error al conectar con el asistente.'); setBusy(false); return }
      const reader = res.body?.getReader()
      if (!reader) { updateLast('Error de conexión.'); setBusy(false); return }

      readSSE<{ type: string; content?: string; action?: any; message?: string }>(
        reader,
        (data) => {
          if (data.type === 'text' && data.content) {
            aiContent += data.content
            updateLast(aiContent)
          }
          if (data.type === 'action' && data.action) {
            handleStudioAction(data.action, editor, token, updateLast)
          }
          if (data.type === 'error' && data.message) {
            updateLast(aiContent || `Error: ${data.message}`)
          }
        },
        () => setBusy(false),
      )
    }).catch(() => {
      updateLast('Error de conexión con el servidor.')
      setBusy(false)
    })
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 10px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 20, lineHeight: 1.6 }}>
            El asistente IA puede ayudarte a crear y modificar diseños.
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'Crea una página web para una cafetería',
                'Genera una imagen de un paisaje',
                'Haz una landing page moderna',
                'Escribe un artículo sobre IA',
              ].map(s => (
                <button key={s} onClick={() => { setInput(s) }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'var(--font-body)', textAlign: 'left', transition: 'all 0.12s' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 4 }}>
            <div style={{ maxWidth: '92%', padding: '8px 11px', borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px', background: m.role === 'user' ? 'var(--brand)' : 'var(--bg-elevated)', color: m.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: '0.8rem', lineHeight: 1.55, fontFamily: 'var(--font-body)', border: m.role === 'ai' ? '1px solid var(--border-default)' : 'none', whiteSpace: 'pre-wrap' }}>{m.content}{m.role === 'assistant' && i === messages.length - 1 && busy && <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--text-primary)', marginLeft: 3, animation: 'blink 1s infinite', verticalAlign: 'middle' }} />}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid var(--border-default)', display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder={busy ? 'El asistente está pensando...' : 'Dime qué crear...'} disabled={busy} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', outline: 'none', opacity: busy ? 0.5 : 1 }} />
        <button onClick={send} disabled={!input.trim() || busy} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: input.trim() && !busy ? 'var(--brand)' : 'var(--bg-elevated)', color: input.trim() && !busy ? '#fff' : 'var(--text-tertiary)', fontSize: '0.78rem', fontWeight: 700, cursor: input.trim() && !busy ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)', transition: 'all 0.12s' }}>Enviar</button>
      </div>
      <style>{`@keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }`}</style>
      <div style={{ textAlign: 'center', fontSize: '0.6rem', color: 'var(--text-tertiary)', padding: '0 10px 6px', opacity: 0.5 }}>
        Editor visual basado en <a href="https://grapesjs.com" target="_blank" rel="noopener" style={{ color: 'var(--text-tertiary)', textDecoration: 'underline' }}>GrapesJS</a> (BSD license)
      </div>
    </div>
  )
}

function ImageSearchPanel({ editor }: { editor: any }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ title: string; thumb: string; url: string }[]>([])
  const [busy, setBusy] = useState(false)

  const search = useCallback(async () => {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setResults([])
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=40&prop=imageinfo&iiprop=url|thumburl&iiurlwidth=300&format=json&origin=*`
      const res = await fetch(url)
      const data = await res.json()
      const pages: Record<string, any> = data?.query?.pages || {}
      const items = Object.values(pages).map((p: any) => ({
        title: p.title,
        thumb: p.imageinfo?.[0]?.thumburl || '',
        url: p.imageinfo?.[0]?.url || '',
      })).filter(i => i.thumb && i.url)
      setResults(items)
    } catch { /* noop */ }
    setBusy(false)
  }, [query, busy])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 6 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Buscar en Wikimedia Commons..." style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'var(--font-body)', outline: 'none' }} />
        <button onClick={search} disabled={!query.trim() || busy} style={{ padding: '7px 12px', borderRadius: 6, border: 'none', background: query.trim() && !busy ? 'var(--brand)' : 'var(--bg-elevated)', color: query.trim() && !busy ? '#fff' : 'var(--text-tertiary)', fontSize: '0.72rem', fontWeight: 700, cursor: query.trim() && !busy ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-body)' }}>{busy ? '⋯' : 'Buscar'}</button>
      </div>
      {results.length > 0 && (
        <div style={{ padding: '6px 10px', fontSize: '0.65rem', color: 'var(--text-tertiary)', letterSpacing: '0.05em' }}>{results.length} resultados para "{query}"</div>
      )}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, alignContent: 'start' }}>
        {results.length === 0 && !busy && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.75rem', padding: 24, lineHeight: 1.6 }}>
            {query ? 'Sin resultados' : 'Busca imágenes libres en Wikimedia Commons'}
          </div>
        )}
        {results.map(img => (
          <div key={img.title} onClick={() => {
            if (editor) editor.addComponents(`<img src="${img.url}" alt="${img.title}" style="max-width:100%;border-radius:6px;" />`)
          }} style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-default)', cursor: 'pointer', transition: 'all 0.12s', background: 'var(--bg-base)' }} title={`Añadir "${img.title}"`}>
            <img src={img.thumb} alt={img.title} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block', borderBottom: '1px solid var(--border-default)' }} />
            <div style={{ padding: '5px 8px', fontSize: '0.62rem', color: 'var(--text-tertiary)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.title.replace('File:', '')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Studio Action Handler ──

function handleStudioAction(
  action: { type: string; params?: any },
  editor: any,
  token: string | null,
  updateLast: (content: string) => void,
) {
  if (!action?.type) return

  const type = action.type
  const params = action.params || {}

  if (type === 'create_image') {
    const url = pollinationsUrl(params.prompt || params.description || 'beautiful landscape', params.style || 'realistic')
    if (editor) {
      editor.addComponents(`<img src="${url}" alt="${params.prompt || ''}" style="max-width:100%;border-radius:8px;" />`)
    }
    updateLast(`✓ Imagen generada y añadida al lienzo.`)
  }

  if (type === 'create_webpage' || type === 'create_ui') {
    if (editor) {
      const desc = params.description || 'página web'
      const tpl = TEMPLATES.find(t => t.id === 'hero-section') || TEMPLATES[0]
      editor.runCommand(`load-template-${tpl.id}`)
    }
    updateLast(`✔ Plantilla cargada. Personalízala con los paneles de Estilos.`)
  }

  if (type === 'create_design') {
    if (editor) {
      const tpl = TEMPLATES[1]
      editor.runCommand(`load-template-${tpl.id}`)
    }
    updateLast(`✔ Diseño base listo. Edita los textos y colores a tu gusto.`)
  }
}
