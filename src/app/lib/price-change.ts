import {activeQuotes,latestQuote,Property} from './model';
export function priceSummary(p:Property){
 const quotes=activeQuotes(p).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.createdAt.localeCompare(a.createdAt));
 const current=latestQuote(p),previous=quotes[1];const area=Number(p.area);const calculated=!!current&&Number.isFinite(area)&&area>0;
 const totalDelta=current&&previous?Number((current.amount-previous.amount).toFixed(4)):null;
 return {unit:calculated?current!.amount*10000/area:(Number(p.unitPrice)>0?Number(p.unitPrice):null),calculated,totalDelta,unitDelta:calculated&&totalDelta!==null?totalDelta*10000/area:null};
}
