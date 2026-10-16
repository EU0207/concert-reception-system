// エラー本文や要求内容を保存せず、検証ソース内の位置だけを残す。
export function failureDiagnostic(error){
 const locations=[...String(error.stack??'').matchAll(/poc\/(GD91-\d+\/[a-z0-9-]+\.mjs):(\d+):(\d+)/g)]
  .slice(0,4).map(([,file,line,column])=>({file,line:Number(line),column:Number(column)}));
 const operators=['strictEqual','deepStrictEqual','==','==='];
 return {sourceLocations:locations,...(operators.includes(error.operator)?{assertionOperator:error.operator}:{})};
}
