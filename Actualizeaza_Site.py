# -*- coding: utf-8 -*-
"""
Actualizeaza_Site.py
=====================
Pune pe site (https://mrf19.github.io/) exact pagina TOATE_Pariurile.html,
identica cu cea de pe calculator - toate sporturile, toate tab-urile, arhive,
evaluari, detalii, bilete. Nimic schimbat, nimic in plus.

Aplicatia de telefon (MRF_Pariuri.apk) incarca acelasi site, deci se
actualizeaza automat dupa ce ruleaza asta - nu trebuie reinstalata niciodata.

De rulat DUPA pipeline-ul normal - dar de obicei nu trebuie: 00_Runner.py il
ruleaza deja singur la final, ca ultim pas.

Ruleaza cu dublu-click sau: python Actualizeaza_Site.py
"""
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).parent
MASTER_HTML = BASE.parent / "TOATE_Pariurile.html"
DEST = BASE / "index.html"
SURSA_PAGINI = BASE.parent / "pagini"   # paginile de sport, ca fisiere separate
DEST_PAGINI = BASE / "pagini"

# GitHub REFUZA fisiere peste 100 MB (limita fixa, nu se poate ocoli).
LIMITA_MB = 95


def ruleaza(comanda, descriere, ignora_erori=False):
    print(f"\n>>> {descriere}...")
    rez = subprocess.run(comanda, cwd=str(BASE), capture_output=True,
                         text=True, encoding="utf-8", errors="replace")
    iesire = ((rez.stdout or "") + (rez.stderr or "")).strip()
    if iesire:
        print(iesire[:1500])
    if rez.returncode != 0 and not ignora_erori:
        print(f"[EROARE] {descriere} a esuat (cod {rez.returncode})")
        return False
    return True


def main():
    print("=" * 60)
    print(f"ACTUALIZARE SITE  {datetime.now().strftime('%d.%m.%Y %H:%M')}")
    print("=" * 60)

    if not MASTER_HTML.exists():
        print(f"\n[EROARE] Nu gasesc {MASTER_HTML.name} - ruleaza intai pipeline-ul.")
        return

    # Paginile de sport sunt fisiere SEPARATE (folderul "pagini") - pagina
    # principala doar le referentiaza, deci acum limita de 100 MB per fisier
    # se aplica fiecarui sport in parte, nu unui singur fisier urias.
    prea_mari = [f for f in [MASTER_HTML] + sorted(SURSA_PAGINI.glob("*.html"))
                 if f.stat().st_size / 1024 / 1024 > LIMITA_MB]
    if prea_mari:
        print("\n[EROARE] Fisiere peste limita GitHub de 100 MB:")
        for f in prea_mari:
            print(f"         {f.name}: {f.stat().st_size / 1024 / 1024:.0f} MB")
        print("         Ruleaza Comprima_Sigle.py ca sa scada sub limita.")
        return

    marime_mb = MASTER_HTML.stat().st_size / 1024 / 1024
    print(f"\n>>> Copiez pagina principala ({marime_mb:.1f} MB)...")
    shutil.copy2(MASTER_HTML, DEST)

    # paginile de sport: stergem intai ce era (sporturi disparute), apoi copiem
    if DEST_PAGINI.exists():
        shutil.rmtree(DEST_PAGINI)
    if SURSA_PAGINI.exists():
        shutil.copytree(SURSA_PAGINI, DEST_PAGINI)
        total = sum(f.stat().st_size for f in DEST_PAGINI.glob("*.html")) / 1024 / 1024
        n = len(list(DEST_PAGINI.glob("*.html")))
        print(f">>> Copiez {n} pagini de sport ({total:.0f} MB in total)...")
    else:
        print(f"[ATENTIE] Nu gasesc folderul {SURSA_PAGINI} - paginile de sport lipsesc!")

    ruleaza(["git", "add", "-A"], "Pregatesc modificarile")

    # Pagina (zeci de MB) se schimba la FIECARE rulare, iar Git ar pastra
    # pentru totdeauna fiecare versiune veche in istoric - dupa ~10 rulari
    # s-ar aduna ~1 GB si ar depasi limita de repository GitHub. Solutie:
    # rescriem mereu ACELASI commit unic (--amend) + push fortat, deci noua
    # versiune o INLOCUIESTE pe cea veche, istoricul ramane la o versiune.
    mesaj = f"Site MRF - actualizat {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    rez = subprocess.run(["git", "commit", "--amend", "-m", mesaj], cwd=str(BASE),
                         capture_output=True, text=True, encoding="utf-8", errors="replace")
    iesire = ((rez.stdout or "") + (rez.stderr or "")).strip()
    if iesire:
        print("\n" + iesire[:400])

    # "-u origin main": daca ramura n-are inca legatura cu GitHub (ex. dupa
    # o recreare de ramura), o creeaza automat - altfel push-ul ar esua cu
    # "no upstream branch"
    if ruleaza(["git", "push", "--force", "-u", "origin", "main"],
               f"Urc pe GitHub Pages ({marime_mb:.0f} MB, dureaza cateva minute)"):
        print("\n" + "=" * 60)
        print("GATA! In ~1-2 minute e actualizat:")
        print("   https://mrf19.github.io/")
        print("   ... si aplicatia de pe telefon, automat.")
        print("=" * 60)


if __name__ == "__main__":
    main()
    try:
        input("\nEnter pentru a inchide...")
    except EOFError:
        pass
