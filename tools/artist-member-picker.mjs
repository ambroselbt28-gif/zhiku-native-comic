import fs from 'node:fs';
import assert from 'node:assert/strict';
export function applyArtistMemberPicker(source){
    const start=source.indexOf("            case 'addmember': {"),end=source.indexOf("            case 'editstring':",start);
    assert(start>=0&&end>start,'画师组添加入口');
    source=source.slice(0,start)+`            case 'addmember': {
                openArtistMemberPicker({getData,groupId:el.dataset.id,model:M,modal,esc,commit,imgUrl,openViewer,notify:message=>toastr.success(message,'画师组')});
                break;
            }
`+source.slice(end);
    const marker='function viewGroup(d) {';
    assert.equal(source.split(marker).length,2);
    return source.replace(marker,()=>fs.readFileSync(new URL('../src/artist-member-picker.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+marker);
}
