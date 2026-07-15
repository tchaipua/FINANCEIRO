import argparse
from pathlib import Path
import xml.etree.ElementTree as ET

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen.canvas import Canvas

NS = {"nfe": "http://www.portalfiscal.inf.br/nfe"}


def value(node, path, default=""):
    found = node.find(path, NS)
    return (found.text or "").strip() if found is not None else default


def br_money(raw):
    try:
        return f"{float(raw):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except (TypeError, ValueError):
        return "0,00"


def centered(canvas, text, y, size=8, bold=False):
    canvas.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    canvas.drawCentredString(40 * mm, y, text)


def line(canvas, y):
    canvas.setLineWidth(0.35)
    canvas.line(3 * mm, y, 77 * mm, y)


def fit_text(canvas, text, x, y, max_width, size=7, bold=False):
    font = "Helvetica-Bold" if bold else "Helvetica"
    while size > 4.5 and stringWidth(text, font, size) > max_width:
        size -= 0.25
    canvas.setFont(font, size)
    canvas.drawString(x, y, text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("xml")
    parser.add_argument("output")
    args = parser.parse_args()
    root = ET.parse(args.xml).getroot()
    inf = root.find(".//nfe:infNFe", NS)
    protocol = root.find(".//nfe:infProt", NS)
    if inf is None or protocol is None:
        raise SystemExit("XML processado autorizado inválido.")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    page_height = 165 * mm
    canvas = Canvas(str(output), pagesize=(80 * mm, page_height))
    canvas.setTitle("DANFE NFC-e - Homologação")
    y = page_height - 8 * mm

    centered(canvas, value(inf, "nfe:emit/nfe:xNome"), y, 9, True)
    y -= 4 * mm
    cnpj = value(inf, "nfe:emit/nfe:CNPJ")
    ie = value(inf, "nfe:emit/nfe:IE")
    centered(canvas, f"CNPJ: {cnpj}  IE: {ie}", y, 6.5)
    y -= 3.5 * mm
    address = value(inf, "nfe:emit/nfe:enderEmit/nfe:xLgr")
    number = value(inf, "nfe:emit/nfe:enderEmit/nfe:nro")
    city = value(inf, "nfe:emit/nfe:enderEmit/nfe:xMun")
    uf = value(inf, "nfe:emit/nfe:enderEmit/nfe:UF")
    centered(canvas, f"{address}, {number} - {city}/{uf}", y, 6.2)
    y -= 4 * mm
    line(canvas, y)
    y -= 5 * mm
    centered(canvas, "DANFE NFC-e", y, 10, True)
    y -= 4 * mm
    centered(canvas, "Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", y, 5.8)
    y -= 5 * mm
    canvas.setFillColorRGB(0.8, 0, 0)
    centered(canvas, "EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO", y, 7.4, True)
    y -= 4 * mm
    centered(canvas, "SEM VALOR FISCAL", y, 9, True)
    canvas.setFillColorRGB(0, 0, 0)
    y -= 5 * mm
    line(canvas, y)
    y -= 4 * mm
    canvas.setFont("Helvetica-Bold", 6)
    canvas.drawString(3 * mm, y, "CÓDIGO  DESCRIÇÃO")
    canvas.drawRightString(77 * mm, y, "QTD x VL.UN.     TOTAL")
    y -= 3.5 * mm

    for det in inf.findall("nfe:det", NS):
        prod = det.find("nfe:prod", NS)
        if prod is None:
            continue
        code = value(prod, "nfe:cProd")
        description = value(prod, "nfe:xProd")
        quantity = value(prod, "nfe:qCom")
        unit = value(prod, "nfe:vUnCom")
        total = value(prod, "nfe:vProd")
        fit_text(canvas, f"{code}  {description}", 3 * mm, y, 74 * mm, 6.2)
        y -= 3.2 * mm
        canvas.setFont("Helvetica", 6.2)
        canvas.drawRightString(77 * mm, y, f"{quantity} x {br_money(unit)}     {br_money(total)}")
        y -= 4 * mm

    line(canvas, y)
    y -= 4.5 * mm
    total_value = value(inf, "nfe:total/nfe:ICMSTot/nfe:vNF")
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(3 * mm, y, "VALOR TOTAL R$")
    canvas.drawRightString(77 * mm, y, br_money(total_value))
    y -= 4 * mm
    payment = value(inf, "nfe:pag/nfe:detPag/nfe:vPag")
    canvas.setFont("Helvetica", 6.5)
    canvas.drawString(3 * mm, y, "FORMA DE PAGAMENTO: DINHEIRO")
    canvas.drawRightString(77 * mm, y, br_money(payment))
    y -= 5 * mm
    line(canvas, y)
    y -= 4.5 * mm
    number_nf = value(inf, "nfe:ide/nfe:nNF")
    series = value(inf, "nfe:ide/nfe:serie")
    issued = value(inf, "nfe:ide/nfe:dhEmi")
    centered(canvas, f"NFC-e nº {number_nf}  Série {series}  Emissão {issued}", y, 6.2)
    y -= 4 * mm
    key = inf.attrib.get("Id", "").replace("NFe", "")
    grouped_key = " ".join(key[i:i + 4] for i in range(0, len(key), 4))
    centered(canvas, "CHAVE DE ACESSO", y, 6, True)
    y -= 3.5 * mm
    centered(canvas, grouped_key, y, 6.2)
    y -= 4 * mm
    centered(canvas, "Consulte pela chave de acesso ou pelo QR Code", y, 5.8)
    y -= 37 * mm
    qr_url = value(root, ".//nfe:infNFeSupl/nfe:qrCode")
    qr = QrCodeWidget(qr_url)
    bounds = qr.getBounds()
    size = 34 * mm
    drawing = Drawing(size, size, transform=[size / (bounds[2] - bounds[0]), 0, 0, size / (bounds[3] - bounds[1]), 0, 0])
    drawing.add(qr)
    renderPDF.draw(drawing, canvas, 23 * mm, y)
    y -= 4 * mm
    protocol_number = value(protocol, "nfe:nProt")
    received = value(protocol, "nfe:dhRecbto")
    centered(canvas, f"Protocolo de autorização: {protocol_number}", y, 6.4, True)
    y -= 3.5 * mm
    centered(canvas, received, y, 6.2)
    y -= 5 * mm
    line(canvas, y)
    y -= 4 * mm
    centered(canvas, "CONSUMIDOR NÃO IDENTIFICADO", y, 6.3, True)
    y -= 5 * mm
    centered(canvas, "Teste técnico MSINFOR - ambiente de homologação", y, 5.7)
    canvas.save()
    print(output)


if __name__ == "__main__":
    main()
