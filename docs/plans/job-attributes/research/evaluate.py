import json,sys,re
sys.path.insert(0,sys.argv[3])
import extract as E
s={x["id"]:x for x in json.load(open(sys.argv[1]+"/samples.json"))}
ids=json.load(open(sys.argv[1]+"/label_ids.json")); L=json.load(open(sys.argv[1]+"/labels.json"))
def yr_first(text):
    for m in E.YR.finditer(text):
        win=text[max(0,m.start()-60):m.end()+80].lower()
        if "experience" not in win and "industry" not in win: continue
        if re.search(r"(founded|history|for over|company|we have|track record of)",text[max(0,m.start()-60):m.start()].lower()): continue
        a=E.n(m.group(1))
        if a>25: continue
        return a
for name,fn in [("min",lambda t:(E.years(t) or {}).get("min")),("first",yr_first)]:
    tp=fp=fn_=tn=0; errs=[]
    for i,jid in enumerate(ids):
        g=L["years"][i]; p=fn(s[jid]["text"])
        if p is None and g is None: tn+=1
        elif p is None: fn_+=1; errs.append((i,"MISS",g))
        elif g is None: fp+=1; errs.append((i,"FP",p))
        elif p==g: tp+=1
        else: fp+=1; fn_+=1; errs.append((i,"WRONG",p,g))
    print(f"years[{name}] TP={tp} FP={fp} FN={fn_} TN={tn} P={tp/(tp+fp):.2f} R={tp/(tp+fn_):.2f}", errs)
# clearance: level exact, and status exact
lt=lf=ln=st=0; errs=[]; det_tp=det_fp=det_fn=0
for i,jid in enumerate(ids):
    g=L["clr"].get(str(i)); p=E.clearance(s[jid]["text"])
    if p and p["level"]=="NONE": p=None
    if g and p: det_tp+=1
    elif p and not g: det_fp+=1; errs.append((i,"FP",p))
    elif g and not p: det_fn+=1; errs.append((i,"MISS",g))
    if g and p:
        if p["level"]==g[0]: lt+=1
        else: errs.append((i,"LEVEL",p["level"],g[0]))
        if p["status"]==g[1]: st+=1
        else: errs.append((i,"STATUS",p["status"],g[1]))
        if p["poly"]!=g[2]: errs.append((i,"POLY",p["poly"]))
n=len(L["clr"])
print(f"clearance detect TP={det_tp} FP={det_fp} FN={det_fn}; level correct {lt}/{n}; status correct {st}/{n}", errs)
# coverage on all 150
allx=list(s.values()); y=sum(1 for x in allx if E.years(x["text"])); c=sum(1 for x in allx if (E.clearance(x["text"]) or {}).get("level") not in (None,"NONE"))
print("coverage on", len(allx), "years", y, "clearance", c)
