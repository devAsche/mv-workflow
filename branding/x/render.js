const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();
for(const [f,w,h,out] of [['header.html',1500,500,'x_header_1500x500.png'],['icon.html',400,400,'x_icon_800.png']]){
 const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
 await p.goto('file://'+path.resolve(__dirname,f));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1500);
 await p.screenshot({path:path.resolve(__dirname,'out_'+out)});}
await b.close()})();
