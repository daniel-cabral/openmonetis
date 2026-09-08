#!/usr/bin/env python3
"""Confronta os lançamentos do openmonetis com o extrato do C6, por valor e nome.

    python confronto.py <export-do-app.csv> <extrato-c6.csv> <MM/AAAA>

Casa por valor e quantidade, e mostra a descrição dos dois lados para que a
decisão final seja tomada por nome E valor — nunca só pelo valor, que num
extrato com recorrentes não distingue nada.

Saída: totais dos dois lados, o que sobra no app e o que falta no app.
"""

import csv
import io
import re
import sys
from collections import Counter


def moeda(raw):
    """'-R$\xa01.234,56' -> -1234.56. Devolve None quando não é um valor.

    O export do app usa espaço não-quebrável entre o sinal e o número; um
    strip() comum limpa as receitas e deixa as despesas quebradas, zerando as
    saídas em silêncio. Por isso a limpeza é por caractere permitido.
    """
    t = re.sub(r"[^0-9,.\-]", "", raw or "").replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def ler_app(caminho):
    """Export do app: Data, Nome, Tipo, Condição, Pagamento, Valor, ..."""
    saidas, nomes, total = Counter(), {}, 0.0
    entradas = 0.0
    with io.open(caminho, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            v = moeda(r.get("Valor"))
            if v is None:
                continue
            if v < 0:
                total += -v
                k = round(-v, 2)
                saidas[k] += 1
                nomes.setdefault(k, []).append((r.get("Data", ""), (r.get("Nome") or "").strip()))
            else:
                entradas += v
    return saidas, nomes, total, entradas


def ler_extrato(caminho, mes):
    """Extrato C6, filtrado por Data Contábil no mês MM/AAAA."""
    saidas, nomes, total = Counter(), {}, 0.0
    entradas = 0.0
    with io.open(caminho, encoding="utf-8-sig") as f:
        for row in csv.reader(f, delimiter=","):
            if len(row) < 7 or row[1][3:] != mes:
                continue
            try:
                credito, debito = float(row[4]), float(row[5])
            except ValueError:
                continue  # cabeçalho do banco
            if debito:
                total += debito
                k = round(debito, 2)
                saidas[k] += 1
                nomes.setdefault(k, []).append((row[1], row[2]))
            entradas += credito
    return saidas, nomes, total, entradas


def mostrar(titulo, diff, nomes):
    print(f"\n=== {titulo} ===")
    soma = 0.0
    for valor, qtd in sorted(diff.items(), key=lambda kv: -kv[0] * kv[1]):
        soma += valor * qtd
        for data, nome in nomes.get(valor, [])[:qtd]:
            print(f"  R$ {valor:>10.2f}  {data}  {nome[:60]}")
    print(f"  TOTAL: R$ {soma:.2f}")
    return soma


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 1
    app_csv, extrato_csv, mes = sys.argv[1:4]

    app_saidas, app_nomes, app_total, app_entradas = ler_app(app_csv)
    bnk_saidas, bnk_nomes, bnk_total, bnk_entradas = ler_extrato(extrato_csv, mes)

    print(f"APP   {mes}: entradas {app_entradas:>11.2f} | saidas {app_total:>11.2f}")
    print(f"BANCO {mes}: entradas {bnk_entradas:>11.2f} | saidas {bnk_total:>11.2f}")
    print(f"diferenca de entradas: {app_entradas - bnk_entradas:>11.2f}")
    print(f"diferenca de saidas:   {app_total - bnk_total:>11.2f}")

    sobra = mostrar("SAIDAS no APP sem contrapartida no BANCO", app_saidas - bnk_saidas, app_nomes)
    falta = mostrar("SAIDAS no BANCO sem contrapartida no APP", bnk_saidas - app_saidas, bnk_nomes)
    print(f"\nliquido (sobra - falta): R$ {sobra - falta:.2f}")
    print("\nConfira cada linha por NOME antes de concluir: valores repetidos")
    print("no mes sao normais e o casamento por valor pode apontar o par errado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
