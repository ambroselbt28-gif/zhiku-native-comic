import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyAncientPreset(source){
    const patch=(from,to)=>{assert.equal(source.split(from).length,2,'古风副本入口：'+from.slice(0,70));source=source.replace(from,()=>to);};
    patch("            case 'aiprename':",`            case 'aipancient': {
                const cfg=T.aiCfg();
                if(!cfg.list[cfg.active]){toastr.info('先选中「我的预设 1」或其他自定义预设', '古风预设');break;}
                const result=createAncientPreset(cfg,M.uid);
                cfg.active=result.preset.id;commit();render();
                toastr.success(result.created?'古风副本已生成并选中，原预设保留':'已切到已有古风副本，保留你的修改','AI 预设');break;
            }
            case 'aiprename':`);
    patch("          <label class=\"pc-btn\" style=\"cursor:pointer\">导入文件",`          \${kind === 'own' ? '<button class="pc-btn" data-act="aipancient">生成古风副本</button>' : ''}
          <label class="pc-btn" style="cursor:pointer">导入文件`);
    patch('        <div class="pc-hint">只对「翻译和 AI」',`        \${kind === 'own' ? '<div class="pc-hint">古风副本：复制当前预设，补充古风主提示词与画面规划。选中后对本设备智库 AI 功能生效；换现代卡时切回原预设。</div>' : ''}
        <div class="pc-hint">只对「翻译和 AI」`);
    return fs.readFileSync(new URL('../src/ancient-preset.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+source;
}
