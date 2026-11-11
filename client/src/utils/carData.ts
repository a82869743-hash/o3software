import catalogJson from '../data/carCatalog.json';
/**
 * ─── CAR BRAND, MODEL & VARIANT DATASET ──────────────────────────────
 * Auto-generated from car model dataset.csv (1277 entries)
 * Used in registration, add car modal, job card, quick wash, and booking forms.
 * Brand → Model → Variant hierarchy. "Other/Others" options trigger manual input.
 */

export interface CarModelData {
  models: string[];
  variants: Record<string, string[]>;
}

// Older models from the first dataset (kept so customers with older cars still find them).
const legacyCarData: Record<string, CarModelData> = {
  "Aston Martin": {
    models: ["Db 11","Rapide","Vantage"],
    variants: {
      "Db 11": ["V12"],
      "Rapide": ["Luxe"],
      "Vantage": ["Coupe"]
    }
  },
  "Audi": {
    models: ["A3","A3 Cabriolet","A4","A5","A5 Cabriolet","A6","A8 L","Q3","Q5","Q7","Q8","R8","Rs5","Rs7","S5"],
    variants: {
      "A3": ["35 Tdi Premium Plus","35 Tdi Technology","35 Tfsi Premium Plus","35 Tfsi Technology"],
      "A3 Cabriolet": ["40 Tfsi"],
      "A4": ["Premium Plus 35 Tfsi","Technology 35 Tfsi"],
      "A5": ["Sportback"],
      "A5 Cabriolet": ["2.0 Tdi"],
      "A6": ["Premium Plus 45 Tfsi","Technology 45 Tfsi"],
      "A8 L": ["55 Tfsi Quattro"],
      "Q3": ["30 Tdi Premium Fwd","35 Tdi Quattro Premium Plus","35 Tdi Quattro Technology","30 Tfsi Premium"],
      "Q5": ["35 Tdi Premium Plus","35 Tdi Technology","45 Tfsi Premium Plus","45 Tfsi Technology"],
      "Q7": ["45 Tdi Premium Plus","45 Tdi Technology Pack","40 Tfsi Quattro Premium Plus","40 Tfsi Quattro Technology Pack","45 Tdi Black Styling","40 Tfsi Quattro Black Styling"],
      "Q8": ["55 Tfsi Quattro Tiptronic"],
      "R8": ["V10 Plus"],
      "Rs5": ["Coupe"],
      "Rs7": ["Sportback"],
      "S5": ["Sportback"]
    }
  },
  "BMW": {
    models: ["3-Series","5-Series","6-Series","7-Series","M2 Competition","M4","M5","X1","X3","X4","X5","X7","Z4 Roadster"],
    variants: {
      "3-Series": ["320D Sport","320D Luxury Line","330I M Sport"],
      "5-Series": ["520D Luxury Line","530D M Sport","530I M Sport"],
      "6-Series": ["630D Gt Luxury Line","630D Gt M Sport","630I Gt Luxury Line","620D Gt Luxury Line"],
      "7-Series": ["730Ld Design Pure Excellence","730Ld Design Pure Excellence Signature","730Ld M Sport","740Li Design Pure Excellence Signature","745Le Xdrive","M760Li Xdrive"],
      "M2 Competition": ["Coupe"],
      "M4": ["Coupe"],
      "M5": ["Competition"],
      "X1": ["Sdrive20D Expedition","Sdrive20D Xline","Xdrive20D M Sport","Sdrive20D M Sport","Sdrive20I Xline"],
      "X3": ["Xdrive 20D Luxury Line","Xdrive 30I Luxury Line","Xdrive20D Xline"],
      "X4": ["Xdrive20D M Sport X","Xdrive30D M Sport X","Xdrive30I M Sport X"],
      "X5": ["Xdrive30D Sport","Xdrive30D Xline","Xdrive40I M Sport"],
      "X7": ["Xdrive 40I","Xdrive30D Dpe Signature"],
      "Z4 Roadster": ["Sdrive 20I","M 40I"]
    }
  },
  "Bajaj": {
    models: ["Qute (Re60)"],
    variants: {
      "Qute (Re60)": ["Qcar","Qcar Cng"]
    }
  },
  "Bentley": {
    models: ["Bentayga","Continental Gt","Flying Spur","Mulsanne"],
    variants: {
      "Bentayga": ["W12","V8"],
      "Continental Gt": ["Coupe"],
      "Flying Spur": ["V8","W12"],
      "Mulsanne": ["Sedan"]
    }
  },
  "Bugatti": {
    models: ["Chiron"],
    variants: {
      "Chiron": ["W16","Sport"]
    }
  },
  "DC": {
    models: ["Avanti"],
    variants: {
      "Avanti": ["Standard"]
    }
  },
  "Datsun": {
    models: ["Go","Redi-Go"],
    variants: {
      "Go": ["D","T","T (O)","A (O)","A","T Vdc","T (O) Vdc","T Cvt","T (O) Cvt"],
      "Redi-Go": ["D","T","A","S","1.0 S","1.0 S Amt"]
    }
  },
  "Ferrari": {
    models: ["458 Speciale","458 Spider","488 Gtb","812 Superfast","Gtc4 Lusso","Portofino"],
    variants: {
      "458 Speciale": ["Coupe"],
      "458 Spider": ["V8"],
      "488 Gtb": ["Std","Spider"],
      "812 Superfast": ["Superfast"],
      "Gtc4 Lusso": ["V8 T","V12"],
      "Portofino": ["V8 Convertible"]
    }
  },
  "Fiat": {
    models: ["Abarth Avventura","Abarth Punto","Avventura","Linea","Linea Classic","Punto Evo","Punto Evo Pure","Urban Cross"],
    variants: {
      "Abarth Avventura": ["1.4 T-Jet"],
      "Abarth Punto": ["1.4 T-Jet"],
      "Avventura": ["Multijet Dynamic","Multijet Active","Multijet Emotion"],
      "Linea": ["Active Fire","Active Multijet","Dynamic Multijet","Emotion Multijet","T-Jet Emotion"],
      "Linea Classic": ["1.3 Multijet","1.4","Plus 1.3 Multijet"],
      "Punto Evo": ["Dynamic 1.2","Active Multijet 1.3","Dynamic Multijet 1.3","Emotion Multijet 1.3"],
      "Punto Evo Pure": ["1.2L Fire Dynamic","1.3"],
      "Urban Cross": ["1.3 Multijet Active","1.3 Multijet Dynamic","1.4 T-Jet Emotion","1.3 Multijet Emotion"]
    }
  },
  "Force": {
    models: ["Gurkha"],
    variants: {
      "Gurkha": ["Xpedition 5 Door","Xplorer 3 Door","Xtreme","Xtreme Abs","Xpedition 3 Door","Xplorer 5 Door"]
    }
  },
  "Ford": {
    models: ["Aspire","Ecosport","Endeavour","Figo","Freestyle","Mustang"],
    variants: {
      "Aspire": ["1.2 Ti-Vct Ambiente","1.2 Ti-Vct Trend Plus","1.2 Ti-Vct Trend","1.5 Tdci Ambiente","1.5 Tdci Trend","1.5 Tdci Trend Plus","1.5 Tdci Titanium","1.5 Tdci Titanium Plus","1.2 Ti-Vct Titanium Plus","1.2 Ti-Vct Titanium","1.2 Trend Plus Cng","1.2 Ti-Vct Blu","1.5 Tdci Blu"],
      "Ecosport": ["1.5L Ti-Vct Ambiente","1.5L Ti-Vct Trend","1.5L Ti-Vct Titanium","1.5L Ti-Vct Titanium Plus At","1.5L Tdci Ambiente","1.5L Tdci Trend","1.5L Tdci Titanium","1.5L Tdci Titanium Plus","1.5L Ti-Vct Titanium Plus","1.5L Tdci Titanium S","1.5L Ti-Vct Thunder Edition","1.5L Tdci Thunder Edition"],
      "Endeavour": ["3.2L 4X4 At Titanium Plus","2.2L 4X2 At Titanium Plus","2.2L 4X2 Mt Titanium"],
      "Figo": ["Ambiente 1.2 Ti-Vct","Ambiente 1.5 Tdci","Titanium 1.2 Ti-Vct","Titanium1.5 Tdci","Titanium Blu 1.2 Ti-Vct","Titanium Blu 1.5 Tdci"],
      "Freestyle": ["1.5L Tdci Ambiente","1.5L Tdci Titanium","1.5L Tdci Titanium Plus","1.2L Ti-Vct Ambiente","1.2L Ti-Vct Titanium","1.2L Ti-Vct Titanium Plus","1.2L Ti-Vct Trend Plus","1.5L Tdci Trend Plus"],
      "Mustang": ["Fastback V8"]
    }
  },
  "Honda": {
    models: ["Accord Hybrid","Amaze","Brv","City","Civic","Cr-V","Jazz","Wr-V"],
    variants: {
      "Accord Hybrid": ["2.0 At"],
      "Amaze": ["S Cvt Petrol","E Mt Diesel","E Mt Petrol","S Cvt Diesel","V Cvt Petrol","V Cvt Diesel","S Mt Diesel","Vx Mt Diesel","V Mt Diesel","Vx Mt Petrol","V Mt Petrol","S Mt Petrol","Exclusive Edition Diesel","Exclusive Edition Petrol","Vx Cvt Diesel","Vx Cvt Petrol","Ace Edition Cvt Diesel","Ace Edition Cvt Petrol","Ace Edition Mt Diesel","Ace Edition Mt Petrol"],
      "Brv": ["E Petrol","S Petrol","V Petrol","Vx Petrol","V Cvt Petrol","S Diesel","V Diesel","Vx Diesel"],
      "City": ["Sv Mt Petrol","V Mt Petrol","Vx Mt Petrol","Vx Cvt Petrol","Sv Mt Diesel","V Mt Diesel","Vx Mt Diesel","Zx Mt Diesel","Zx Cvt Petrol","V Cvt Petrol"],
      "Civic": ["1.8 V Cvt","1.8 Vx Cvt","1.8 Zx Cvt","1.6 Vx Mt","1.6 Zx Mt"],
      "Cr-V": ["2Wd Petrol Cvt","2Wd Diesel At","Awd Diesel At"],
      "Jazz": ["V Petrol","Vx Cvt","Vx Petrol","V Cvt","S Diesel","V Diesel","Vx Diesel","Exclusive Edition Cvt"],
      "Wr-V": ["Vx Diesel","Vx Petrol","S Diesel","S Petrol","Edge Plus Edition Diesel","Edge Plus Edition Petrol","Exclusive Edition Diesel","Exclusive Edition Petrol","V Diesel"]
    }
  },
  "Hyundai": {
    models: ["Aura","Creta","Elantra","Elite I20","Grand I10","Grand I10 Nios","Grand I10 Prime","I20 Active","Kona Electric","Santro","Tucson","Venue","Verna","Xcent","Xcent Prime"],
    variants: {
      "Aura": ["E 1.2 Petrol","S 1.2 Petrol","S 1.2 Amt Petrol","Sx 1.2 Petrol","Sx Plus 1.2 Amt Petrol","Sx (O) 1.2 Petrol","S 1.2 Cng Petrol (Cng +","Sx Plus 1.0 Petrol","S 1.2 Diesel","S 1.2 Amt Diesel","Sx Plus 1.2 Amt Diesel","Sx (O) 1.2 Diesel"],
      "Creta": ["1.4 Crdi E Plus","1.6 Vtvt E Plus","1.6 Vtvt Sx","1.6 Vtvt Sx (O)","1.6 Vtvt Sx At","1.6 Vtvt Sx Dual Tone","1.4 Crdi S","1.6 Crdi Sx","1.6 Crdi Sx (O)","1.6 Crdi Sx At","1.6 Crdi Sx Dual Tone","1.6 Crdi S At","1.6 Vtvt Sx (O) Executive","1.6 Crdi Sx (O) Executive","1.4 Crdi Ex","1.6 Vtvt Ex","Sports Edition Petrol","Sports Edition Diesel"],
      "Elantra": ["S","Sx","Sx At","Sx(O) At"],
      "Elite I20": ["Era 1.2","Era 1.4 Crdi","Magna Plus","Magna Plus Crdi","Sportz Plus","Sportz Plus Crdi Dual Tone","Asta (O) 1.2","Asta (O) Crdi","Asta (O) Cvt","Sportz Plus Dual Tone","Sportz Plus Cvt","Sportz Plus Crdi"],
      "Grand I10": ["1.2 Kappa Vtvt Magna","1.2 Kappa Vtvt Sportz","1.2 Kappa Vtvt Magna At","1.2 Kappa Vtvt Sportz At","1.2 Kappa Vtvt Sportz Dual Tone","1.2 Kappa Vtvt Magna Cng"],
      "Grand I10 Nios": ["Magna 1.2 Crdi","Era 1.2 Vtvt","Magna 1.2 Vtvt","Magna Amt 1.2 Vtvt","Sportz 1.2 Vtvt","Sportz Amt 1.2 Vtvt","Sportz Dual Tone 1.2 Vtvt","Asta 1.2 Vtvt","Sportz Amt 1.2 Crdi","Asta 1.2 Crdi"],
      "Grand I10 Prime": ["Era T Crdi","Era T+ Crdi","Era T Vtvt","Era T+ Vtvt","Era T+ Cng Vtvt","Era T Cng Vtvt"],
      "I20 Active": ["1.2 S","1.2 Sx","1.2 Sx Dual Tone","1.4 Sx"],
      "Kona Electric": ["Premium"],
      "Santro": ["Era Mt","Magna Mt","Magna Mt Cng","Magna Amt","Sportz Mt","Sportz Mt Cng","Sportz Amt","Asta Mt"],
      "Tucson": ["2Wd Mt Diesel","2Wd Mt Petrol","2Wd At Gl Diesel","2Wd At Gl Petrol","4Wd At Gls Diesel","2Wd At Gls Petrol","2Wd At Gl(O) Petrol","2Wd At Gl(O) Diesel"],
      "Venue": ["1.2 Kappa Mt E","1.0 Turbo Gdi Mt S","1.4 Crdi Mt E","1.0 Turbo Gdi Mt Sx","1.0 Turbo Gdi Mt Sx Dual Tone","1.0 Turbo Gdi Mt Sx(O)","1.0 Turbo Gdi Dct S","1.0 Turbo Gdi Dct Sx Plus","1.2 Kappa Mt S","1.4 Crdi Mt S","1.4 Crdi Mt Sx","1.4 Crdi Mt Sx Dual Tone","1.4 Crdi Mt Sx(O)"],
      "Verna": ["1.6 Vtvt Sx","1.6 Crdi Sx","1.6 Crdi Sx (O)","1.6 Vtvt Sx (O)","1.6 Crdi Sx Plus At","1.6 Vtvt Sx(O) At","1.4 Vtvt Ex","1.4 Vtvt E","1.6 Vtvt Sx (O) Anniversary Edition","1.6 Vtvt Sx Plus At","1.6 Crdi Sx(O) At","1.4 Crdi E","1.4 Crdi Ex"],
      "Xcent": ["S 1.2","S At 1.2","Sx 1.2","Sx 1.2 (O)","S 1.2 Crdi","E","Sx 1.2 Crdi","Sx 1.2 Crdi (O)","E Crdi"],
      "Xcent Prime": ["Cng T + (Cng +","T","T+","Cng T (Cng +","T+ Crdi","T Crdi"]
    }
  },
  "ICML": {
    models: ["Extreme"],
    variants: {
      "Extreme": ["Ld Di Non Ac 9 Seater Bsiii","Ld Crdfi Non Ac 9 Seater Bsiv","Ld Di Ps Ac 9 Seater Bsiii","Ld Crdfi Ps Ac 9 Seater Bsiii","Sd Di 9 Seater Bsiii","Ld Crdfi Ps Ac 9 Seater Bsiv","Vd Crdfi 7 Seater Bsiii","Vd Di 7 Seater Bsiii","Sd Crdfi 9 Seater Bsiv","Vd Crdfi 7 Seater Bsiv","Sd Crdfi 9 Seater Bsiii"]
    }
  },
  "Isuzu": {
    models: ["Dmax V-Cross","Mu-X"],
    variants: {
      "Dmax V-Cross": ["Standard","High Z","Z Prestige"],
      "Mu-X": ["4X2","4X4"]
    }
  },
  "Jaguar": {
    models: ["F-Pace","F-Type","Xe","Xf","Xj"],
    variants: {
      "F-Pace": ["Prestige","Prestige Petrol"],
      "F-Type": ["5.0 Convertible R","5.0 Coupe R","Svr Coupe","Svr Convertible","2.0L Coupe","2.0L Convertible","2.0 Convertible R Dynamic","2.0 Coupe R Dynamic"],
      "Xe": ["S Petrol","S Diesel","Se Diesel","Se Petrol"],
      "Xf": ["2.0 Prestige","2.0 Portfolio","2.0 Portfolio Diesel","2.0 Prestige Diesel","2.0 Pure Diesel"],
      "Xj": ["3.0L","3.0L Portfolio","50"]
    }
  },
  "Jeep": {
    models: ["Compass","Compass Trailhawk","Grand Cherokee","Wrangler"],
    variants: {
      "Compass": ["1.4 Limited At","1.4 Sport","1.4 Limited (O) At","2.0 Sport","2.0 Longitude","2.0 Longitude (O)","2.0 Limited","2.0 Limited (O)","2.0 Limited 4X4","2.0 Limited (O) 4X4","1.4 Limited Plus At Petrol","2.0 Limited Plus 4X2 Diesel","2.0 Limited Plus 4X4 Diesel","2.0 Sport Plus","1.4 Sport Plus","1.4 Longitude (O) At","1.4 Limited (O) At Petrol Black Pack","2.0 Limited (O) Black Pack","2.0 Limited (O) 4X4 Black Pack","2.0 Limited Plus 4X4 At","2.0 Longitude 4X4 At"],
      "Compass Trailhawk": ["2.0 Trailhawk 4X4 At","2.0 Trailhawk (O) 4X4 At"],
      "Grand Cherokee": ["Limited","Summit","Srt","Summit Petrol"],
      "Wrangler": ["Unlimited"]
    }
  },
  "Kia": {
    models: ["Carnival","Seltos"],
    variants: {
      "Carnival": ["Premium 7 Str","Premium 8 Str","Prestige 7 Str","Prestige 9 (6+3) Str","Limousine 7 Str"],
      "Seltos": ["Hte 1.5","Htk 1.5","Htk Plus 1.5","Htx 1.5","Htx Cvt 1.5","Hte 1.5 Diesel","Htk 1.5 Diesel","Htk Plus 1.5 Diesel","Htk Plus At 1.5 Diesel","Htx Plus 1.5 Diesel","Htx Plus At 1.5 Diesel","Gtk 1.4","Gtx 1.4","Gtx At 1.4","Gtx Plus 1.4","Htx 1.5 Diesel"]
    }
  },
  "Lamborghini": {
    models: ["Aventador","Huracan","Urus"],
    variants: {
      "Aventador": ["Lp 700-4","Lp700-4 Roadster","S"],
      "Huracan": ["Lp 610-4","Lp 580-2","Avio","Performante","Lp 580-2 Spyder","Lp 610-4 Spyder","Evo","Evo Spyder","Evo Rwd"],
      "Urus": ["V8"]
    }
  },
  "Land Rover": {
    models: ["Discovery","Discovery Sport","Range","Range Evoque","Range Evoque Convertible","Range Sport","Range Velar"],
    variants: {
      "Discovery": ["3.0 Hse Diesel","3.0 Se Diesel","3.0 Hse Petrol","3.0 Se Petrol","3.0 S Diesel","3.0 S Petrol","3.0 Hse Luxury Diesel","3.0 Hse Luxury Petrol"],
      "Discovery Sport": ["S","R-Dynamic Se"],
      "Range": ["5.0L V8 Autobiography Petrol","5.0L V8 Svautobiography Dynamic Petrol","3.0L V6 Vogue Lwb Petrol","5.0L V8 Svautobiography Lwb Petrol","3.0L Tdv6 Vogue Diesel","3.0L Tdv6 Vogue Lwb Diesel","4.4L Sdv8 Autobiography Lwb Diesel","4.4L Sdv8 Svautobiography Lwb Diesel","4.4L Sdv8 Vogue Se Lwb Diesel","3.0L V6 Vogue Se Lwb Petrol"],
      "Range Evoque": ["S","Se R-Dynamic","S Petrol","Se R-Dynamic Petrol"],
      "Range Evoque Convertible": ["2.0 Hse Dynamic"],
      "Range Sport": ["5.0L V8 Svr Petrol","2.0L S Petrol","2.0L Se Petrol","3.0L V6 Se Petrol","2.0L Hse Petrol","3.0L V6 Hse Petrol","5.0L V8 Autobiography Dynamic Petrol","3.0L Tdv6 S Diesel","3.0L Tdv6 Se Diesel","4.4L Sdv8 Hse Diesel"],
      "Range Velar": ["2.0 Diesel R-Dynamic S","2.0 Petrol R-Dynamic S"]
    }
  },
  "Lexus": {
    models: ["Es","Lc 500H","Ls 500H","Lx 450D","Lx 570","Nx 300H","Rx 450H"],
    variants: {
      "Es": ["300H"],
      "Lc 500H": ["Coupe"],
      "Ls 500H": ["Luxury","Ultra Luxury","Distinct"],
      "Lx 450D": ["V8"],
      "Lx 570": ["V8"],
      "Nx 300H": ["F-Sport","Luxury"],
      "Rx 450H": ["450Hl Luxury"]
    }
  },
  "MG": {
    models: ["Hector","Zs Ev"],
    variants: {
      "Hector": ["1.5L Style","2.0L Style","2.0L Super","2.0L Smart","2.0L Sharp","1.5L Super","1.5L Super Hybrid","1.5L Sharp Hybrid","1.5L Smart Hybrid","1.5L Smart Dct","1.5L Sharp Dct"],
      "Zs Ev": ["Excite","Exclusive"]
    }
  },
  "Mahindra": {
    models: ["Alturas G4","Bolero","Bolero Power Plus","E Verito","E2O Plus","Kuv100 Nxt","Marazzo","Nuvosport","Scorpio","Thar","Tuv300","Tuv300 Plus","Verito","Verito Vibe","Xuv300","Xuv500","Xylo"],
    variants: {
      "Alturas G4": ["2Wd At","4Wd At"],
      "Bolero": ["Zlx","Slx","Sle","Ex","Ex Non Ac"],
      "Bolero Power Plus": ["Zlx","Slx","Sle","Lx","Plus Ac Bs4 Ps","Plus Non Ac Bs4 Ps"],
      "E Verito": ["D4","D2","D6"],
      "E2O Plus": ["P4","P6"],
      "Kuv100 Nxt": ["K2 6Str","K2+ 6Str","K2 D 6Str","K2+ D 6Str","K4+ D 6Str","K4+ 6Str","K6+ 6Str","K6+ D 6Str","K8 6Str","K8 D 6Str","K8 6 Str Dual Tone","K8 D 6 Str Dual Tone","K4+ 5Str","K6+ 5Str","K8 5Str","K4+ D 5Str","K6+ D 5Str","K8 D 5Str","K2 D 5Str Taxi","K2 D 6Str Taxi","K2 5Str Cng Taxi","K2 6Str Cng Taxi"],
      "Marazzo": ["M2 7 Str","M4 7 Str","M6 7 Str","M8 7 Str","M2 8 Str","M4 8 Str","M6 8 Str","M8 8 Str"],
      "Nuvosport": ["N4","N6","N8","N4 +","N6 Amt","N8 Amt"],
      "Scorpio": ["S3 2Wd","4Wd Getaway","2Wd Getaway","S5 2Wd","S7 120 2Wd","S7 140 2Wd","S11 2Wd","S11 4Wd","S9 2Wd"],
      "Thar": ["Crde","700 Special Edition","Crde Abs"],
      "Tuv300": ["T4 Plus","T6 Plus","T8","T10","T10 (O)","T10 Dual Tone","T10 (O) Dual Tone"],
      "Tuv300 Plus": ["P4","P6","P8"],
      "Verito": ["1.5 D2","1.5 D4 Bs-Iv","1.5 D6 Bs-Iv"],
      "Verito Vibe": ["D2","D4","D6"],
      "Xuv300": ["1.2 W4","1.2 W6","1.2 W8","1.2 W8(O)","1.5 W4","1.5 W6","1.5 W8","1.5 W8 (O)","1.5 W8 Amt","1.5 W8 (O) Amt","1.5 W6 Amt"],
      "Xuv500": ["G At","W7","W7 At","W9","W9 At","W11","W11 At","W11 (O)","W11 (O) At","W11 (O) Awd","W11 (O) Awd At","W3"],
      "Xylo": ["D2 Bs-Iv","D4 Bs-Iv","H4 Bs-Iv","H4 Abs Bs-Iv","H8 Abs Airbags Bs-Iv"]
    }
  },
  "Maruti Suzuki": {
    models: ["Alto","Alto 800 Tour","Alto K10","Baleno","Baleno Rs","Celerio","Celerio Tour","Celerio X","Ciaz","Dzire","Dzire Tour","Eeco","Ertiga","Gypsy","Ignis","Omni","S-Cross","S-Presso","Swift","Vitara Brezza","Wagon","Xl6"],
    variants: {
      "Alto": ["Std","Std (O)","Lxi","Lxi (O)","Vxi","Lxi Cng (Cng +","Lxi (O) Cng (Cng +","Vxi Plus"],
      "Alto 800 Tour": ["H1","H1 (O)"],
      "Alto K10": ["Lxi","Vxi","Lx","Vxi (O)","Lxi Cng (O)","Vxi Amt (O)"],
      "Baleno": ["1.3 Delta","1.3 Alpha","1.3 Sigma","1.3 Zeta","1.2 Alpha","1.2 Alpha Cvt","1.2 Delta","1.2 Delta Cvt","1.2 Sigma","1.2 Zeta","1.2 Delta Dualjet","1.2 Zeta Dualjet","1.2 Zeta Cvt"],
      "Baleno Rs": ["Rs 1.0"],
      "Celerio": ["Lxi","Vxi","Vxi At","Zxi","Zxi (Opt)","Vxi Cng Mt","Zxi Ags","Lxi Mt (O)","Vxi (O) Mt","Vxi (O) Ags","Zxi (O) Ags"],
      "Celerio Tour": ["H2","H2 Cng"],
      "Celerio X": ["Vxi (O)","Vxi","Vxi Amt","Vxi Amt (O)","Zxi","Zxi (O)","Zxi Amt","Zxi Amt (O)"],
      "Ciaz": ["1.3L Alpha Smart Hybrid","1.3L Sigma Smart Hybrid","1.3L Delta Smart Hybrid","1.3L Zeta Smart Hybrid","1.5L Sigma Smart Hybrid","1.5L Delta Smart Hybrid","1.5L Zeta Smart Hybrid","1.5L Alpha Smart Hybrid","1.5L Delta At Smart Hybrid","1.5L Zeta At Smart Hybrid","1.5L Alpha At Smart Hybrid","1.5L Alpha","1.5L Delta","1.5L Zeta"],
      "Dzire": ["Lxi","Vxi","Ldi","Zxi","Vdi","Vxi Amt","Zdi Amt","Zdi","Zxi Plus","Zxi At","Zxi Plus Amt","Zdi Plus","Vdi Amt","Zdi Plus Amt"],
      "Dzire Tour": ["Ldi","Lxi","Lxi Cng"],
      "Eeco": ["5 Str","7 Str","5 Str With Ac+Htr","5 Str With Ac+Htr Cng","5 Str With Htr Cng"],
      "Ertiga": ["Lxi","Zxi","Vxi At","Zxi Plus","Vxi","Zxi At","1.5L Vdi","1.5L Zdi","1.5L Zdi Plus","Vxi Cng (Cng +"],
      "Gypsy": ["Hard Top","Soft Top"],
      "Ignis": ["Alpha 1.2 Amt","Alpha 1.2 Mt","Delta 1.2 Amt","Delta 1.2 Mt","Sigma 1.2 Mt","Zeta 1.2 Amt","Zeta 1.2 Mt"],
      "Omni": ["5 Str Bs-Iv","E 8 Str Bs-Iv"],
      "S-Cross": ["1.3L Sigma","1.3L Delta","1.3L Zeta","1.3L Alpha"],
      "S-Presso": ["Std","Std (O)","Lxi","Lxi (O)","Vxi","Vxi (O)","Vxi Ags","Vxi+","Vxi (O) Ags","Vxi+ Ags"],
      "Swift": ["Lxi","Vxi","Vxi Amt","Zxi","Zxi Amt","Zxi Plus","Ldi","Vdi","Vdi Amt","Zdi","Zdi Amt","Zdi Plus","Zxi Plus Amt","Zdi Plus Amt"],
      "Vitara Brezza": ["Ldi","Vdi","Zdi","Zdi+","Zdi+ Dual Tone","Zdi+ Ags","Vdi Ags","Zdi Ags","Zdi+ Dual Tone Ags"],
      "Wagon": ["Vxi","Vxi Ags","1.2L Zxi","Lxi","1.2L Vxi","1.2L Vxi Ags","1.2L Zxi Ags","Lxi (O)","Vxi (O)","1.2L Vxi (O)","1.2L Vxi Ags (O)","Vxi Ags (O)","Lxi Cng","Lxi (O) Cng"],
      "Xl6": ["Zeta Mt","Alpha Mt","Zeta At","Alpha At"]
    }
  },
  "Maserati": {
    models: ["Ghibli","Grancabrio","Granturismo","Levante","Quattroporte"],
    variants: {
      "Ghibli": ["Diesel","Gransport","Granlusso"],
      "Grancabrio": ["Standard"],
      "Granturismo": ["Sport"],
      "Levante": ["Diesel","Gransport","Granlusson"],
      "Quattroporte": ["Granlusso"]
    }
  },
  "Mini": {
    models: ["Clubman","Convertible","Cooper 3 Door","Cooper 5 Door","Countryman","John Cooper Works"],
    variants: {
      "Clubman": ["Cooper S"],
      "Convertible": ["Cooper S"],
      "Cooper 3 Door": ["Cooper D","Cooper S"],
      "Cooper 5 Door": ["Cooper D"],
      "Countryman": ["Cooper S","Cooper Sd","Cooper S Jcw Inspired","Black Edition"],
      "John Cooper Works": ["Hatch"]
    }
  },
  "Mitsubishi": {
    models: ["Montero","Outlander","Pajero Sport"],
    variants: {
      "Montero": ["3.2 At"],
      "Outlander": ["2.4L Outlander"],
      "Pajero Sport": ["2.5 Mt","2.5 At","Limited Edition","Select Plus Mt","Select Plus At"]
    }
  },
  "Nissan": {
    models: ["Gtr","Kicks","Micra","Micra Active","Sunny","Terrano"],
    variants: {
      "Gtr": ["3.8 V6"],
      "Kicks": ["Xl Petrol","Xv Petrol","Xl Diesel","Xv Diesel","Xv Premium","Xv Premium (O)","Xv Premium (O) Dual Tone","Xe Diesel"],
      "Micra": ["Xl (O) Cvt","Xv Cvt","Xld (O)","Xvd"],
      "Micra Active": ["Xl","Xv","Xl (O)"],
      "Sunny": ["Xe Petrol","Xl Petrol","Xl Diesel","Xv Diesel","Xe Diesel","Xv Cvt","Special Edition Diesel"],
      "Terrano": ["Xe D 85Ps","Xv D Premium 110 Ps Amt","Xl (P)","Xl D(O)","Xv D Premium 110 Ps","Sport Edition"]
    }
  },
  "Porsche": {
    models: ["718","911","Cayenne","Cayenne Coupe","Macan","Panamera"],
    variants: {
      "718": ["Boxster","Cayman"],
      "911": ["Carrera S","Carrera S Cabriolet"],
      "Cayenne": ["E-Hybrid","Turbo","Base"],
      "Cayenne Coupe": ["Base","Turbo"],
      "Macan": ["S","Base"],
      "Panamera": ["Turbo","Turbo Executive","Turbo Sport Turismo"]
    }
  },
  "Premier": {
    models: ["Rio"],
    variants: {
      "Rio": ["Gx","Ex","Glx","Dx","Lx","Crdi4"]
    }
  },
  "Renault": {
    models: ["Captur","Duster","Kwid","Lodgy","Triber"],
    variants: {
      "Captur": ["Rxe Petrol","Rxe Diesel","Platine Diesel Dual Tone","Platine Petrol Dual Tone"],
      "Duster": ["Rxe Petrol","Rxs Petrol","Rxs (Opt) Cvt","85 Ps Rxe Mt Diesel","85 Ps Rxs Mt Diesel","110 Ps Rxs Mt Diesel","110 Ps Rxz Mt Diesel","110 Ps Rxz Amt Diesel","110 Ps Rxs Awd (Opt) Diesel"],
      "Kwid": ["Rxe 0.8","Std 0.8","Rxl 0.8","Rxt 0.8","Rxt 1.0","Climber 1.0 Mt","Rxt Amt 1.0","Climber Amt 1.0","Rxt (O) 1.0","Rxt (O) Amt 1.0","Climber (O) Mt 1.0","Climber (O) Amt 1.0"],
      "Lodgy": ["85 Ps Std","85 Ps Rxe 8 Seater","Stepway Rxz 110Ps 8-Seater","Stepway Rxz 110Ps 7-Seater","Stepway Rxl 85Ps 8-Seater","Stepway Rxz 85Ps 8-Seater","85 Ps Rxe 7 Seater"],
      "Triber": ["Rxe","Rxl","Rxt","Rxz"]
    }
  },
  "Skoda": {
    models: ["Kodiaq","Kodiaq Scout","Monte Carlo","Octavia","Rapid","Superb","Superb Sportline"],
    variants: {
      "Kodiaq": ["Style 2.0 Tdi 4X4 At","Laurin And Klement","Corporate Edition"],
      "Kodiaq Scout": ["2.0 Tdi At"],
      "Monte Carlo": ["Monte Carlo 1.5 Tdi At","Monte Carlo 1.6 Mpi At","Monte Carlo 1.5 Tdi Mt","Monte Carlo 1.6 Mpi Mt"],
      "Octavia": ["Ambition 1.4 Tsi","Ambition 2.0 Tdi Cr","Style 1.4 Tsi","Style 1.8 Tsi At","Style 2.0 Tdi Cr","Style 2.0 Tdi Cr At","L & K 1.8 Tsi At","L & K 2.0 Tdi Cr At","Corporate Edition 1.4 Tsi","Corporate Edition 2.0 Tdi","Onyx 1.8 Tsi Dsg","Onyx 2.0 Tdi Dsg"],
      "Rapid": ["1.6 Mpi Ambition","1.5 Tdi Cr Active","1.6 Mpi Active","1.5 Tdi Cr Ambition","1.5 Tdi Cr Ambition At","1.6 Mpi Style At","1.5 Tdi Cr Style At","1.5 Tdi Cr Style","1.6 Mpi Style","1.6 Mpi Ambition At","Onyx Mt Petrol","Onyx At Petrol","Onyx Mt Diesel","Onyx At Diesel"],
      "Superb": ["Style 1.8 Tsi Mt","Style 1.8 Tsi At","L & K 1.8 Tsi At","L & K 2.0 Tdi At","Style 2.0 Tdi At","Corporate Edition 1.8 Tsi At","Corporate Edition 2.0 Tdi At"],
      "Superb Sportline": ["Sportline 1.8L Tsi At","Sportline 2.0L Tdi At"]
    }
  },
  "Tata": {
    models: ["Altroz","Bolt","Harrier","Hexa","Nano Genx","Nexon","Nexon Ev","Safari Storme","Tiago","Tiago Nrg","Tigor","Tigor Ev","Winger","Zest"],
    variants: {
      "Altroz": ["Xe Petrol","Xm Petrol","Xt Petrol","Xz Petrol","Xz (O) Petrol","Xe Diesel","Xm Diesel","Xt Diesel","Xz Diesel","Xz (O) Diesel"],
      "Bolt": ["Xt Diesel","Xe Diesel","Xm Diesel","Xms Diesel","Xt Petrol","Xe Petrol","Xm Petrol","Xms Petrol"],
      "Harrier": ["Revotorq Xe","Revotorq Xm","Revotorq Xt","Revotorq Xz","Revotorq Xz Dual Tone","Revotorq Dark Edition"],
      "Hexa": ["Xm Plus 4X2","Xt 4X4","Xta 4X2","Xt 4X2","Xe 4X2","Xm 4X2","Xma 4X2"],
      "Nano Genx": ["Xt","Xe","Emax Xm","Xta","Xm","Xma"],
      "Nexon": ["Xe","Xm","Xz","Xz Plus","Xz Plus Dual Tone","Xz Plus (O)","Xz Plus (O) Dual Tone","Xma","Xza Plus","Xza Plus Dual Tone","Xza Plus (O)","Xza Plus (O) Dual Tone","Xe Diesel","Xm Diesel","Xz Diesel","Xz Plus Diesel","Xz Plus Diesel Dual Tone","Xz Plus (O) Diesel","Xz Plus (O) Diesel Dual Tone","Xma Diesel","Xza Plus Diesel","Xza Plus Diesel Dual Tone","Xza Plus (O) Diesel","Xza Plus (O) Diesel Dual Tone"],
      "Nexon Ev": ["Xm","Xz Plus","Xz Plus Lux"],
      "Safari Storme": ["2.2 Lx 4X2","2.2 Ex 4X2","2.2 Vx 4X2 Varicor 400","2.2 Vx 4X4 Varicor 400"],
      "Tiago": ["Revotron Xe","Revotron Xt","Revotron Xz","Revotron Xz Plus","Revotron Xz Plus Dual Tone","Revotron Xza","Revotron Xza Plus","Revotron Xza Plus Dual Tone"],
      "Tiago Nrg": ["1.2L Revotron","1.05L Revotorq","1.2L Revotron Amt"],
      "Tigor": ["Revotron Xe","Revotron Xm","Revotron Xz","Revotron Xz Plus","Revotron Xma","Revotron Xza Plus"],
      "Tigor Ev": ["Xm+","Xt+","Xe+"],
      "Winger": ["15S"],
      "Zest": ["Xe Petrol","Xe Diesel","Xm Petrol","Xms Petrol","Xt Petrol","Xm Diesel","Xms Diesel","Xt Diesel","Xma Diesel","Xta Diesel","Zest Premio Edition"]
    }
  },
  "Toyota": {
    models: ["Camry","Corolla Altis","Etios Cross","Etios Liva","Fortuner","Glanza","Innova Crysta","Land Cruiser","Land Cruiser Prado","Platinum Etios","Prius","Yaris"],
    variants: {
      "Camry": ["Hybrid"],
      "Corolla Altis": ["G Petrol","G At Petrol","Gl Petrol","Gl Diesel","G Diesel","Vl At Petrol"],
      "Etios Cross": ["V","G","Vd","Gd","1.2 X Edition","1.4 X Edition"],
      "Etios Liva": ["G","V","Gd","Vx","Vxd","Vd","Dual Tone V","Dual Tone Vd","Dual Tone Vx","Dual Tone Vxd","Gx","Gxd","Vx Dual Tone Limited Edition","Vxd Dual Tone Limited Edition"],
      "Fortuner": ["2.8 4X2 At","2.8 4X2 Mt","2.8 4X4 Mt","2.8 4X4 At","2.7 4X2 At","2.7 4X2 Mt","Trd Celebratory Edition"],
      "Glanza": ["G Hybrid","V","G Cvt","V Cvt","G Mt"],
      "Innova Crysta": ["2.4 Gx 7 Str","2.4 Vx 7 Str","2.4 Gx 8 Str","2.4 Vx 8 Str","2.4 Zx 7 Str","2.7 Gx At 8 Str","2.7 Gx At 7 Str","2.7 Zx At 7 Str","2.7 Vx 7 Str","2.7 Gx Mt 7 Str","2.7 Gx Mt 8 Str","Touring Sport 2.4 Vx 7 Str","Touring Sport 2.7 Vx 7 Str","Touring Sport 2.7 Zx At 7 Str","2.4 G Plus 7 Str","2.4 G Plus 8 Str"],
      "Land Cruiser": ["Vx"],
      "Land Cruiser Prado": ["Vx L"],
      "Platinum Etios": ["G","V","Gd","Vd","Vxd","Vx","Gx","Gxd","Vxd Limited Edition","Vx Limited Edition"],
      "Prius": ["Z8"],
      "Yaris": ["J","G","V","Vx Cvt","G Cvt","J Cvt","V Cvt","Vx","V (O)","J (O)","G (O)","J (O) Cvt","G (O) Cvt","V (O) Cvt"]
    }
  },
  "Volkswagen": {
    models: ["Ameo","Passat","Polo","Tiguan","Vento"],
    variants: {
      "Ameo": ["Trendline 1.5L Tdi","Comfortline 1.5L Tdi","Highline Plus 1.5L Tdi Dsg","Highline Plus 1.5L Tdi","Trendline 1.0L","Comfortline 1.0L","Highline Plus 1.0L","Gt Line Tdi Dsg"],
      "Passat": ["2.0 Tdi Comfortline","2.0 Tdi Highline","2.0 Tdi Comfortline Connect","2.0 Tdi Highline Connect"],
      "Polo": ["Trendline 1.0L (P)","Comfortline 1.0 (P)","Highline Plus 1.0 (P)","Trendline 1.5L (D)","Comfortline 1.5 (D)","Highline Plus 1.5 (D)","Gt Tsi","Gt Tdi"],
      "Tiguan": ["Comfortline 2.0L Tdi Amt","Highline 2.0L Tdi Amt"],
      "Vento": ["Trendline 1.6 (P)","Highline 1.6 (P)","Comfortline 1.6 (P)","Highline 1.2 (P) Dsg","Highline Plus 1.2 (P) Dsg","Trendline 1.5 (D)","Comfortline 1.5 (D)","Highline 1.5 (D)","Highline 1.5 (D) Dsg","Highline Plus 1.5 (D) Dsg","Gt Line (D)","Gt Line (P) Dsg"]
    }
  },
  "Volvo": {
    models: ["S60","S60 Cross Country","S90","V40","V40 Cross Country","V90 Cross Country","Xc40","Xc60","Xc90"],
    variants: {
      "S60": ["Polestar","Momentum"],
      "S60 Cross Country": ["D4"],
      "S90": ["D4 Inscription"],
      "V40": ["Kinetic","R Design"],
      "V40 Cross Country": ["D3","T4"],
      "V90 Cross Country": ["D5 Inscription"],
      "Xc40": ["D4 Momentum","D4 Inscription","T4 R-Design"],
      "Xc60": ["Inscription D5"],
      "Xc90": ["D5 Inscription","D5 Momentum","T8 Excellence","T8 Inscription","D5 R-Design"]
    }
  }
};

/** Legacy compat: brand -> model list (without variants) */
// ─── The car list: data/carCatalog.json (same file as the server's). Brand → model → [car type, trims]. ───
type Catalog = Record<string, Record<string, [string, string]>>;
const CATALOG: Catalog = Object.fromEntries(Object.entries(catalogJson as any).filter(([k]) => !k.startsWith('_'))) as Catalog;
const keyOf = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const BRAND_SAME: Record<string, string> = { mercedesbenz: 'Mercedes-Benz', mercedes: 'Mercedes-Benz', benz: 'Mercedes-Benz', maruti: 'Maruti Suzuki', suzuki: 'Maruti Suzuki', tatamotors: 'Tata', vw: 'Volkswagen', mgmotor: 'MG', rangerover: 'Land Rover', forcemotors: 'Force', rollsroyce: 'Rolls-Royce' };
const catalogBrand = (b: string) => BRAND_SAME[keyOf(b)] || Object.keys(CATALOG).find(x => keyOf(x) === keyOf(b)) || null;

/** Car type from the car list for this exact model (null when the model is not in the list). */
export function catalogCategory(brand: string, model: string): string | null {
  const m = keyOf(model);
  if (!m) return null;
  const b = catalogBrand(brand);
  const find = (models: Record<string, [string, string]>, exact = false) => {
    let best: [string, string] | null = null, len = 0;
    for (const [name, v] of Object.entries(models)) {
      const k = keyOf(name);
      // exact name, or a longer name like "Creta SX (O)" that starts with the model
      if ((m === k || (!exact && m.startsWith(k))) && k.length > len) { best = v; len = k.length; }
    }
    return best?.[0] || null;
  };
  if (b && CATALOG[b]) return find(CATALOG[b]);
  // brand unknown: only an exact model name counts (short names like "ES" would match too much)
  for (const models of Object.values(CATALOG)) { const t = find(models, true); if (t) return t; }
  return null;
}

// Full list = the car list first, then older models it does not have.
export const carDataFull: Record<string, CarModelData> = {};
for (const [brand, models] of Object.entries(CATALOG)) {
  carDataFull[brand] = { models: Object.keys(models), variants: Object.fromEntries(Object.entries(models).map(([m, [, trims]]) => [m, trims.split('|')])) };
}
for (const [brand, d] of Object.entries(legacyCarData)) {
  const b = catalogBrand(brand) || brand;
  const entry = carDataFull[b] || (carDataFull[b] = { models: [], variants: {} });
  const have = new Set(entry.models.map(keyOf));
  for (const m of d.models) {
    if (have.has(keyOf(m))) continue;
    entry.models.push(m); entry.variants[m] = d.variants[m] || [];
  }
}
for (const d of Object.values(carDataFull)) d.models.sort((a, b) => a.localeCompare(b));

/** Sorted list of brand names for dropdowns */
export const carBrands: string[] = [...Object.keys(carDataFull).sort((a, b) => a.localeCompare(b)), "Others"];

export const carData: Record<string, string[]> = Object.fromEntries(
  Object.entries(carDataFull).map(([brand, d]) => [brand, [...d.models, "Other"]])
);
carData["Others"] = ["Other"];

/** Get models for a given brand */
export function getModelsForBrand(brand: string): string[] {
  if (brand === "Others") return ["Other"];
  const entry = carDataFull[brand];
  return entry ? [...entry.models, "Other"] : [];
}

/** Get variants for a given brand + model */
export function getVariantsForModel(brand: string, model: string): string[] {
  const entry = carDataFull[brand];
  if (!entry) return [];
  return entry.variants[model] || [];
}

const modelCategoryMap: Record<string, string> = {
  // Maruti Suzuki
  "alto": "hatchback",
  "alto 800": "hatchback",
  "alto 800 tour": "hatchback",
  "alto k10": "hatchback",
  "s-presso": "hatchback",
  "celerio": "hatchback",
  "celerio tour": "hatchback",
  "celerio x": "hatchback",
  "wagon": "hatchback",
  "wagon r": "hatchback",
  "wagonr": "hatchback",
  "swift": "hatchback",
  "ignis": "semi_sedan",
  "omni": "hatchback",
  "eeco": "hatchback",
  "ritz": "hatchback",
  "a-star": "hatchback",
  "estilo": "hatchback",
  "zen": "hatchback",
  "800": "hatchback",
  "baleno": "hatchback",
  "baleno rs": "hatchback",
  "dzire": "sedan",
  "dzire tour": "sedan",
  "swift dzire": "sedan",
  "sx4": "sedan",
  "esteem": "sedan",
  "ciaz": "sedan",
  "fronx": "semi_sedan",
  "brezza": "semi_sedan",
  "vitara brezza": "semi_sedan",
  "grand vitara": "suv",
  "jimny": "suv",
  "s-cross": "suv",
  "ertiga": "suv",
  "xl6": "suv",
  "invicto": "suv",
  "gypsy": "suv",

  // Hyundai
  "santro": "hatchback",
  "eon": "hatchback",
  "grand i10": "hatchback",
  "grand i10 nios": "hatchback",
  "grand i10 prime": "hatchback",
  "i10": "hatchback",
  "getz": "hatchback",
  "i20": "hatchback",
  "elite i20": "hatchback",
  "i20 active": "hatchback",
  "exter": "semi_sedan",
  "xcent": "sedan",
  "xcent prime": "sedan",
  "aura": "sedan",
  "accent": "sedan",
  "verna": "sedan",
  "elantra": "sedan",
  "sonata": "sedan",
  "venue": "semi_sedan",
  "creta": "suv",
  "alcazar": "suv",
  "tucson": "suv",
  "santa fe": "suv",
  "kona electric": "suv",

  // Tata
  "nano": "hatchback",
  "nano genx": "hatchback",
  "indica": "hatchback",
  "tiago": "hatchback",
  "tiago nrg": "hatchback",
  "altroz": "hatchback",
  "punch": "semi_sedan",
  "indigo": "sedan",
  "manza": "sedan",
  "zest": "sedan",
  "tigor": "sedan",
  "tigor ev": "sedan",
  "bolt": "hatchback",
  "nexon": "semi_sedan",
  "nexon ev": "semi_sedan",
  "curvv": "suv",
  "harrier": "suv",
  "safari": "suv",
  "safari storme": "suv",
  "hexa": "suv",
  "aria": "suv",
  "winger": "suv",

  // Mahindra
  "kuv100": "semi_sedan",
  "kuv100 nxt": "hatchback",
  "e2o plus": "hatchback",
  "verito": "sedan",
  "verito vibe": "sedan",
  "e verito": "sedan",
  "bolero": "suv",
  "bolero power plus": "suv",
  "bolero neo": "semi_sedan",
  "thar": "suv",
  "xuv 3xo": "semi_sedan",
  "xuv300": "semi_sedan",
  "xuv500": "suv",
  "xuv700": "suv",
  "scorpio": "suv",
  "scorpio n": "suv",
  "scorpio classic": "suv",
  "marazzo": "suv",
  "nuvosport": "semi_sedan",
  "tuv300": "semi_sedan",
  "tuv300 plus": "suv",
  "xylo": "suv",
  "alturas g4": "premium_suv",

  // Honda
  "brio": "hatchback",
  "jazz": "hatchback",
  "wr-v": "semi_sedan",
  "amaze": "sedan",
  "city": "sedan",
  "civic": "sedan",
  "accord hybrid": "sedan",
  "elevate": "suv",
  "brv": "suv",
  "cr-v": "suv",

  // Toyota
  "etios liva": "hatchback",
  "glanza": "hatchback",
  "etios cross": "suv",
  "platinum etios": "sedan",
  "yaris": "sedan",
  "corolla altis": "sedan",
  "camry": "sedan",
  "prius": "sedan",
  "taisor": "semi_sedan",
  "hyryder": "suv",
  "innova": "suv",
  "innova crysta": "suv",
  "innova hycross": "suv",
  "fortuner": "premium_suv",
  "land cruiser": "premium_suv",
  "land cruiser prado": "premium_suv",

  // Kia
  "sonet": "semi_sedan",
  "seltos": "suv",
  "carens": "suv",
  "syros": "semi_sedan",
  "carnival": "premium_suv",
  "ev6": "suv",

  // Skoda
  "fabia": "hatchback",
  "rapid": "sedan",
  "slavia": "sedan",
  "octavia": "sedan",
  "monte carlo": "sedan",
  "superb": "sedan",
  "superb sportline": "sedan",
  "kylaq": "semi_sedan",
  "kushaq": "suv",
  "kodiaq": "premium_suv",
  "kodiaq scout": "premium_suv",

  // Volkswagen
  "polo": "hatchback",
  "ameo": "sedan",
  "vento": "sedan",
  "virtus": "sedan",
  "passat": "sedan",
  "taigun": "suv",
  "tiguan": "premium_suv",

  // Ford
  "figo": "hatchback",
  "freestyle": "hatchback",
  "aspire": "sedan",
  "ecosport": "semi_sedan",
  "endeavour": "premium_suv",
  "mustang": "premium_sedan",

  // Renault
  "kwid": "hatchback",
  "pulse": "hatchback",
  "kiger": "semi_sedan",
  "triber": "suv",
  "duster": "suv",
  "captur": "suv",
  "lodgy": "suv",

  // Nissan
  "micra": "hatchback",
  "micra active": "hatchback",
  "sunny": "sedan",
  "kicks": "suv",
  "magnite": "semi_sedan",
  "terrano": "suv",
  "x-trail": "suv",
  "gtr": "premium_sedan",

  // MG
  "comet": "hatchback",
  "astor": "suv",
  "hector": "suv",
  "windsor": "suv",
  "zs ev": "suv",
  "gloster": "premium_suv",

  // Citroen & Jeep
  "c3": "hatchback",
  "basalt": "suv",
  "aircross": "suv",
  "compass": "suv",
  "compass trailhawk": "suv",
  "meridian": "premium_suv",
  "wrangler": "premium_suv",
  "grand cherokee": "premium_suv",

  // Fiat & Datsun & Isuzu & Force
  "go": "hatchback",
  "redi-go": "hatchback",
  "punto evo": "hatchback",
  "punto evo pure": "hatchback",
  "abarth punto": "hatchback",
  "abarth avventura": "suv",
  "avventura": "suv",
  "urban cross": "suv",
  "linea": "sedan",
  "linea classic": "sedan",
  "gurkha": "suv",
  "dmax v-cross": "suv",
  "mu-x": "premium_suv",
  "extreme": "suv",
  "rio": "suv",
  "qute (re60)": "hatchback",

  // Luxury & Premium Brands (BMW, Mercedes, Audi, Jaguar, Land Rover, Porsche, Lexus, Volvo, Exotic)
  "2-series": "premium_sedan",
  "3-series": "premium_sedan",
  "5-series": "premium_sedan",
  "6-series": "premium_sedan",
  "7-series": "premium_sedan",
  "m2 competition": "premium_sedan",
  "m4": "premium_sedan",
  "m5": "premium_sedan",
  "x1": "premium_suv",
  "x3": "premium_suv",
  "x4": "premium_suv",
  "x5": "premium_suv",
  "x7": "premium_suv",
  "z4 roadster": "premium_sedan",
  "a-class": "premium_sedan",
  "c-class": "premium_sedan",
  "e-class": "premium_sedan",
  "s-class": "premium_sedan",
  "gla": "premium_suv",
  "glc": "premium_suv",
  "gle": "premium_suv",
  "gls": "premium_suv",
  "g-class": "premium_suv",
  "a3": "premium_sedan",
  "a3 cabriolet": "premium_sedan",
  "a4": "premium_sedan",
  "a5": "premium_sedan",
  "a5 cabriolet": "premium_sedan",
  "a6": "premium_sedan",
  "a8 l": "premium_sedan",
  "q3": "premium_suv",
  "q5": "premium_suv",
  "q7": "premium_suv",
  "q8": "premium_suv",
  "r8": "premium_sedan",
  "rs5": "premium_sedan",
  "rs7": "premium_sedan",
  "s5": "premium_sedan",
  "xe": "premium_sedan",
  "xf": "premium_sedan",
  "xj": "premium_sedan",
  "f-pace": "premium_suv",
  "f-type": "premium_sedan",
  "discovery": "premium_suv",
  "discovery sport": "premium_suv",
  "range": "premium_suv",
  "range evoque": "premium_suv",
  "range evoque convertible": "premium_suv",
  "range sport": "premium_suv",
  "range velar": "premium_suv",
  "718": "premium_sedan",
  "911": "premium_sedan",
  "cayenne": "premium_suv",
  "cayenne coupe": "premium_suv",
  "macan": "premium_suv",
  "panamera": "premium_sedan",
  "s60": "premium_sedan",
  "s60 cross country": "premium_sedan",
  "s90": "premium_sedan",
  "v40": "hatchback",
  "v40 cross country": "hatchback",
  "v90 cross country": "premium_suv",
  "xc40": "premium_suv",
  "xc60": "premium_suv",
  "xc90": "premium_suv",
  "es": "premium_sedan",
  "lc 500h": "premium_sedan",
  "ls 500h": "premium_sedan",
  "lx 450d": "premium_suv",
  "lx 570": "premium_suv",
  "nx 300h": "premium_suv",
  "rx 450h": "premium_suv",
  "bentayga": "premium_suv",
  "continental gt": "premium_sedan",
  "flying spur": "premium_sedan",
  "mulsanne": "premium_sedan",
  "aventador": "premium_sedan",
  "huracan": "premium_sedan",
  "urus": "premium_suv",
  "458 speciale": "premium_sedan",
  "458 spider": "premium_sedan",
  "488 gtb": "premium_sedan",
  "812 superfast": "premium_sedan",
  "gtc4 lusso": "premium_sedan",
  "portofino": "premium_sedan",
  "ghibli": "premium_sedan",
  "grancabrio": "premium_sedan",
  "granturismo": "premium_sedan",
  "levante": "premium_suv",
  "quattroporte": "premium_sedan",
  "chiron": "premium_sedan",
  "avanti": "premium_sedan"
};

export function getCategoryForModel(brand: string, model: string): string {
  const b = brand ? brand.toLowerCase().trim() : '';
  const m = model ? model.toLowerCase().trim() : '';
  
  if (!m) return 'sedan';
  const listed = catalogCategory(brand, model);
  if (listed) return listed;

  const cleanModel = m
    .replace(/\s+gt\s*.*$/i, '')
    .replace(/\s+gtx\s*.*$/i, '')
    .replace(/\s+ev\s*.*$/i, '')
    .replace(/^electric\s+/, '')
    .replace(/\s+roadster$/i, '')
    .replace(/\s+cabriolet$/i, '')
    .replace(/\s+coupe$/i, '')
    .replace(/\s+sportback$/i, '')
    .replace(/\s+convertible$/i, '')
    .replace(/\s+touring$/i, '')
    .replace(/\s+cross$/i, '')
    .replace(/\s+nxt$/i, '')
    .replace(/\s+prime$/i, '')
    .trim();
  
  // 1. Direct key matches
  if (modelCategoryMap[m]) return modelCategoryMap[m];
  if (modelCategoryMap[cleanModel]) return modelCategoryMap[cleanModel];
  
  // 2. Substring key matches
  for (const [key, cat] of Object.entries(modelCategoryMap)) {
    if (cleanModel === key || cleanModel.startsWith(key) || key.startsWith(cleanModel)) {
      return cat;
    }
  }

  // 3. Brand & Pattern-based Heuristics for Luxuries and Off-catalog models
  if (b.includes('audi') || b.includes('bmw') || b.includes('mercedes') || b.includes('porsche') || b.includes('jaguar') || b.includes('land rover') || b.includes('lexus') || b.includes('volvo') || b.includes('bentley') || b.includes('ferrari') || b.includes('lamborghini') || b.includes('maserati') || b.includes('aston martin') || b.includes('bugatti')) {
    if (m.includes('q') || m.includes('x') || m.includes('macan') || m.includes('cayenne') || m.includes('gl') || m.includes('pace') || m.includes('discovery') || m.includes('range') || m.includes('levante') || m.includes('urus') || m.includes('bentayga')) {
      return 'premium_suv';
    }
    return 'premium_sedan';
  }

  // 4. Keyword heuristics for SUV, Hatchback, and Sedan
  if (m.includes('suv') || m.includes('xuv') || m.includes('sport') || m.includes('cross') || m.includes('ranger') || m.includes('safari') || m.includes('harrier') || m.includes('creta') || m.includes('seltos') || m.includes('fortuner') || m.includes('innova') || m.includes('scorpio') || m.includes('bolero') || m.includes('thar') || m.includes('trax') || m.includes('gurkha')) {
    return 'suv';
  }

  if (m.includes('dzire') || m.includes('amaze') || m.includes('aura') || m.includes('tigor') || m.includes('xcent') || m.includes('aspire') || m.includes('zest')) {
    return 'sedan';
  }

  if (m.includes('sedan') || m.includes('verna') || m.includes('city') || m.includes('slavia') || m.includes('virtus') || m.includes('ciaz') || m.includes('linea') || m.includes('sunny')) {
    return 'sedan';
  }

  if (m.includes('alto') || m.includes('wagon') || m.includes('celerio') || m.includes('presso') || m.includes('i10') || m.includes('tiago') || m.includes('kwid') || m.includes('micra') || m.includes('polo') || m.includes('brio') || m.includes('sant')) {
    return 'hatchback';
  }

  if (m.includes('i20') || m.includes('baleno') || m.includes('altroz') || m.includes('glanza') || m.includes('freestyle')) {
    return 'hatchback';
  }

  return 'sedan';
}
