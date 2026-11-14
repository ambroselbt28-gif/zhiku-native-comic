// 当前画面给出明确视线或姿势时，清理固定正面词中对应类别的摆拍指令。
export function preferStoryTags(defaults, story, model) {
    const normalize = value => String(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const posture = /^(?:standing|sitting|kneeling|crouching|squatting|lying|walking|running|leaning|bending)(?:$| (?:on|in|at|beside|next to|behind|up|down|forward|back|backward|straight|upright|cross-legged|over|toward|towards)\b)/;
    const tags = model.tokenize(story).filter(token => token.weight > 0).map(token => normalize(token.text));
    const gaze = tags.some(tag => /\blooking (?:at|to|toward|towards|away|down|up|back|over|into)\b|\b(?:eyes closed|eye contact|gazing at)\b/.test(tag));
    const direction = tags.some(tag => /\b(?:facing|profile|side view|front view|back view|from side|from behind|from front|head turned|head down|head up)\b/.test(tag));
    const pose = tags.some(tag => posture.test(tag));
    const hands = tags.some(tag => /\b(?:hands?|arms?|reaching|holding|offering|receiving|touching|pointing|hug|hugging|handshake|pulling|supporting)\b/.test(tag));
    return model.tokenize(defaults).filter(token => {
        if (token.isArtist || token.weight <= 0) return true;
        const tag = normalize(token.text);
        if (gaze && /^(?:looking (?:at|to|toward|towards|away|down|up|back|over|into)\b.*|eyes closed|(?:direct )?eye contact|gazing at\b.*)$/.test(tag)) return false;
        if (direction && /^(?:facing\b.*|profile|side view|front view|back view|from side|from behind|from front|three-quarter view|head turned\b.*|head down|head up)$/.test(tag)) return false;
        if (pose && posture.test(tag)) return false;
        if (hands && /^(?:arms at sides|hands at sides|hands on hips|hand on hip|arms crossed|crossed arms|folded arms|outstretched arms)$/.test(tag)) return false;
        return true;
    }).map(token => token.raw || (Math.abs(token.weight - 1) < 0.001 ? token.text : `${model.fmtWeight(token.weight)}::${token.text}::`)).join(', ');
}
