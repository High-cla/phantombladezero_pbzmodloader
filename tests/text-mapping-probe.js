'use strict';
// Developer probe: temporary TextBlock and containers, never added to a viewport.
// Invoke run() from a command after the native client-area check. No rendering claim.
const UE=require('ue');
exports.run=()=>{
 const settings=UE.GameUserSettings.GetGameUserSettings(),size=settings.GetScreenResolution();
 if(size.X!==1280||size.Y!==720||settings.GetFullscreenMode()!==2)throw Error('Require 1280x720 windowed');
 const label='采集 FText ✓ 1280';
 const text=UE.KismetTextLibrary.Conv_StringToText(label);
 const widgetClass=UE.TextBlock.StaticClass();
 const widget=UE.NewObject(widgetClass);
 if(!UE.KismetSystemLibrary.IsValid(widget))throw Error('Temporary TextBlock creation failed');
 const describe=value=>({type:typeof value,readback:UE.KismetTextLibrary.Conv_TextToString(value)});
 widget.SetText(text);
 const got=describe(widget.GetText());
 const propertyBefore=describe(widget.Text);
 widget.Text=UE.KismetTextLibrary.Conv_StringToText('属性 '+label);
 const propertyAfter=describe(widget.Text);
 const direct={};
 try{widget.SetText('direct string');direct.type=typeof widget.GetText();direct.value=UE.KismetTextLibrary.Conv_TextToString(widget.GetText());}
 catch(e){direct.error=String(e);}
 const array=UE.NewArray(UE.BuiltinText);array.Add(text);
 const map=UE.NewMap(UE.BuiltinString,UE.BuiltinText);map.Add('label',text);
 const rows={schemaVersion:1,display:{width:size.X,height:size.Y,mode:2},label,
  newObject:{classPath:UE.KismetSystemLibrary.GetPathName(widgetClass),actualClass:widget.GetClass().GetName(),valid:UE.KismetSystemLibrary.IsValid(widget)},
  converted:{type:typeof text,readback:UE.KismetTextLibrary.Conv_TextToString(text)},
  widget:got,
  property:{...propertyBefore,writtenType:propertyAfter.type,written:propertyAfter.readback},
  directString:direct,array:{type:typeof array.Get(0),readback:UE.KismetTextLibrary.Conv_TextToString(array.Get(0))},
  map:{type:typeof map.Get('label'),readback:UE.KismetTextLibrary.Conv_TextToString(map.Get('label'))}};
 console.log('[PBZMOD] api-audit-ftext '+JSON.stringify(rows));
};
