import {parseRooms,FloorPlan} from './property-extras';
import { newId } from './id';
// Extra passes are restricted to the diagram portion of a detail screenshot.
export async function recognizeFloorPlan(worker:any,file:Blob,image:string,text:string):Promise<FloorPlan|undefined>{
 if(!/户\s*型\s*图|使\s*用\s*面\s*积/.test(text))return undefined;
 const bitmap=await createImageBitmap(file);const texts=[text];
 try{for(const crop of [{x:.25,y:.04,w:.5,h:.32},{x:.32,y:.13,w:.28,h:.2}]){const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*crop.w*3);canvas.height=Math.round(bitmap.height*crop.h*3);canvas.getContext('2d')!.drawImage(bitmap,bitmap.width*crop.x,bitmap.height*crop.y,bitmap.width*crop.w,bitmap.height*crop.h,0,0,canvas.width,canvas.height);await worker.setParameters({tessedit_pageseg_mode:'11'});texts.push((await worker.recognize(canvas)).data.text);}}finally{bitmap.close();await worker.setParameters({tessedit_pageseg_mode:'3'})}
 const candidates=texts.flatMap(parseRooms);const rooms=candidates.filter((r,i)=>candidates.findIndex(n=>n.name===r.name&&n.area===r.area)===i);for(const part of texts.slice(1)){for(const match of part.replace(/[ \t]/g,'').matchAll(/(?:^|\n)[^\d\u4e00-\u9fff]{0,8}(\d+\.\d+)\s*m/gi)){if(!rooms.some(r=>Number(r.area)===Number(match[1])))rooms.push({id:newId(),name:'待核对房间',area:match[1],included:true})}}return {image,text:texts.join('\n').slice(0,50000),rooms,confirmed:false};
}
