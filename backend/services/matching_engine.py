"""
Motor de Matching v5.0 — Extraído do Robô de Cotações v4.0
==========================================================
Motor de matching em 3 camadas + EAN para casamento de produtos.
Standalone — sem classe, sem playwright, sem asyncio.
"""

import re
import unicodedata

try:
    from services.product_knowledge import recognize_product as _recognize_product
except Exception:
    try:
        from .product_knowledge import recognize_product as _recognize_product
    except Exception:
        _recognize_product = None

try:
    from rapidfuzz import fuzz, process as rfprocess
    _USE_RAPIDFUZZ = True
except ImportError:
    from thefuzz import fuzz
    rfprocess = None
    _USE_RAPIDFUZZ = False

TAXA_SIMILARIDADE = 0.82  # era 0.75

# ─────────────────────────────────────────────
# CONSTANTES DE CATEGORIAS E TRAVAS
# ─────────────────────────────────────────────

MARCAS_POR_CATEGORIA = {
    # Adoçantes
    'ADOC': {'ADOCYL', 'ZERO', 'MARATA', 'ASSUGRIN', 'TAL QUAL', 'FINN', 'LINEA', 'VIST', 'UNIAO', 'GOLD', 'DIET'},
    'ACHOC': {'NESCAU', 'TODDY', 'TODD', 'NESQUIK', 'OVOMALTINE', 'APTI', 'ITALAC', 'MUKY', 'CHOCOLATTO', 'GOLD', 'NESTLE', 'SUSTAGEN'},
    'AGUA COCO': {'DUCOCO', 'SOCOCO', 'KERO', 'KEROCOCO', 'KERO COCO', 'MAISCOCO', 'MAIS COCO', 'QUADRADO', 'COCO QUADRADO', 'PURO COCO', 'PUROCOCO', 'NOCOKO', 'COCO SUPER', 'COCOSUPER', 'AQUA', 'VITA COCO', 'QUALICOCO'},
    'LEITE COCO': {'DUCOCO', 'SOCOCO', 'KEROCOCO', 'KERO COCO', 'MAISCOCO', 'MAIS COCO', 'NOCOKO', 'PURO COCO', 'PUROCOCO', 'VITA COCO', 'QUALICOCO'},
    'AZEITE': {'GALLO', 'GALO', 'ANDORINHA', 'BORGES', 'CARBONELL', 'COCINERO', 'COCINEIRO', 'FILIPPO BERIO', 'FILLIPO BERIO', 'COLAVITA', 'DELEYDA', 'LA ESPANOLA', 'LA ESPANHOLA', 'MONINI', 'ESPORAO', 'DE CECCO', 'PAGANINI', 'SINTRA', 'CASA DO AZEITE', 'TRADICAO', 'VALE FERTIL', 'RESERVA', 'ESPECIAL'},
    'BISC': {'ADRIA', 'MARILAN', 'VITARELLA', 'VITAR', 'PIRAQUE', 'BAUDUCCO', 'BAUDUCO', 'BAUDUC', 'MABEL', 'RANCHEIRO', 'OREO', 'CLUBSOCIAL', 'TRAKINAS', 'TRAKI', 'TODDY', 'NIKITO', 'NABISCO', 'LACTA', 'ARCOR', 'TORTINHA', 'TUC', 'TUCS', 'BELVITA', 'NAGA', 'DADINHO', 'GALO', 'PASSATEMPO', 'BONO', 'PITSTOP', 'TRIUNFO', 'PRODASA', 'LOLI', 'GIRASSOL', 'TORTUGUITA', 'LUANITOS', 'NESTLE', 'LIANE', 'COOKIES', 'SALT PLUS', 'AGUIA', 'NESTLE RECH'},
    'CAFE': {'3 CORACOES', '3CORACOES', 'PILAO', 'BRASILEIRO', 'CABOCLO', 'SELETO', 'UNIAO', 'PELE', 'MELITTA', 'NESCAFE', 'FORT', 'CANECAO', 'SANTO ANDRE', 'FAZENDA MINEIRA', 'MOKA'},
    'CATCHUP': {'HEINZ', 'QUERO', 'HELLMANNS', 'HELLMANN', 'HEMMER', 'KONSUMO', 'CEPERA'},
    'KETCHUP': {'HEINZ', 'QUERO', 'HELLMANNS', 'HELLMANN', 'HEMMER', 'KONSUMO', 'CEPERA'},  # alias pós-normalização
    'MAIONESE': {'HELLMANNS', 'HELLMANN', 'ARISCO', 'SOYA', 'HELLMAN', 'HEMMER', 'LIZA', 'MARIA', 'HEINZ', 'QUERO', 'VIGOR', 'DANCOW', 'SUAVIT'},
    'MAION': {'HELLMANNS', 'HELLMANN', 'ARISCO', 'SOYA', 'HELLMAN', 'HEMMER', 'LIZA', 'MARIA', 'HEINZ', 'QUERO', 'VIGOR', 'DANCOW', 'SUAVIT'},
    'CHOC': {'LACTA', 'NESTLE', 'HERSHEY', 'HERSHEYS', 'GAROTO', 'ARCOR', 'GALAK', 'ALPINO', 'NUTELLA', 'BATON', 'TRENTO', 'BIS', 'KINDER', 'KITKAT', 'APTI', 'BIBS'},
    'ENERG': {'BALY', 'REDBULL', 'MONSTER', 'ENGOV', 'FUSION'},
    'EXTR TOM': {'ELEFANTE', 'QUERO', 'FUGINI', 'PREDILECTA', 'OLE', 'POMAROLA', 'SALSARETTI'},
    'LEITE COND': {'ITALAC', 'MOCA', 'PIRACANJ', 'PIRACANJUBA', 'MOCOCA', 'CAM', 'JORDAO', 'NESTL', 'CAMPOS DO JORDAO', 'TRIANGULO'},
    'LEITE PO': {'ITAMBE', 'PIRACANJ', 'PIRACANJUBA', 'CCGL', 'LEITESOL', 'AURORA', 'NINHO', 'ITALAC', 'NESTLE'},
    'MACAR': {'ADRIA', 'CAMIL', 'BARILLA', 'RENATA', 'FLOR DE LIS', 'D BENTA', 'DBENTA', 'TODESCHINI', 'SANTA AMALIA', 'JOIA', 'LIANE', 'DONA BENTA', 'GALO'},
    'MAC': {'ADRIA', 'CAMIL', 'BARILLA', 'RENATA', 'FLOR DE LIS', 'D BENTA', 'DBENTA', 'TODESCHINI', 'SANTA AMALIA', 'JOIA', 'LIANE', 'DONA BENTA', 'GALO'},
    'MOL TOM': {'POMAROLA', 'QUERO', 'FUGINI', 'PREDILECTA', 'HEINZ', 'TARANTELLA', 'HEMMER', 'SALSARETTI', 'SACCIALI', 'STELLA DORO', 'KNORR', 'CEPERA', 'BARILLA', 'MAMMA DORO'},
    'OLEO': {'SOYA', 'LIZA', 'MAZOLA', 'SINHA', 'SUAVIT', 'COAMO', 'COCAMAR', 'CONCORDIA', 'TRADICAO', 'MARIA', 'GALLO', 'GALO', 'FAISAO', 'SALADA'},
    'REFR': {'TANG', 'FRISCO', 'CLIGHT', 'MAGUARY', 'MID'},
    'REFRESCO': {'MAGUARY', 'SUCO KAPO', 'GUARA', 'GUARAVITON', 'MID'},
    'SUCO': {'MAGUARY', 'DAFRUTA', 'SERIGY', 'KAPO', 'AURORA', 'TAMPICO', 'DEL VALLE'},
    'VIN':   {'MARCUSJAMES', 'SANGUEDEBOI', 'COUNTRYWINE', 'STA CAROLINA', 'LA HACIENDA', 'ST GERMAIN', 'CANTINHO', 'AURORA', 'PATA', 'SANTA LORETO', 'COLLINA'},
    'VINHO': {'MARCUSJAMES', 'SANGUEDEBOI', 'COUNTRYWINE', 'STA CAROLINA', 'LA HACIENDA', 'ALMADEN', 'CHALISE', 'CHILANO', 'CONCHAYTORO', 'DOM BOSCO', 'SALTON', 'STA HELENA', 'SANTA LORETO', 'COLLINA'},
    'VODKA':  {'ORLOFF', 'SMIRNOFF', 'ABSOLUT', 'LEONOFF', 'BALALAIKA', 'ASKOV'},
    'WHISKY': {'JACKDANIELS', 'BALLANTINES', 'CHIVAS', 'WHITEHORSE', 'PASSPORT', 'JOHNNIEWALKER', 'J WALKER'},
    'ATUM':   {'COQUEIRO', 'GCOSTA', 'G COSTA', 'G/COSTA', 'PESCADOR', '88', 'GOMES COSTA'},
    'SARD':   {'COQUEIRO', 'GCOSTA', 'G COSTA', 'G/COSTA', 'GOMES COSTA', 'PESCADOR', '88'},
    'MILHO':  {'QUERO', 'PREDILECTA', 'FUGINI', 'SOFRUTA', 'BONARE', 'SELECT', 'OLE'},
    'ERVILHA': {'QUERO', 'PREDILECTA', 'FUGINI'},
    'COCO RAL': {'DUCOCO', 'MAIS COCO', 'MENINA', 'ADEL COCO', 'COCO DO VALE', 'NORDESTE', 'S OCOCO', 'SOCOCO', 'FLOCOCO', 'COPRA', 'BOM COCO', 'LA PREFERIDA'},
    'MIST BOLO': {'DBENTA', 'D BENTA', 'DONA BENTA', 'ITALAC', 'FLEISCHMANN', 'DR OETKER', 'OETKER', 'RENATA', 'SOL', 'TIO JOAO', 'APTI', 'ANA MARIA', 'BAUDUC', 'BAUDUCCO'},
    'ISOT':    {'GATORADE', 'BALY', 'POWERADE'},
    'GATORADE': {'GATORADE'},
    'SUCO CONC': {'MAGUARY', 'SERIGY'},
    'AGUARD': {'51', 'SAO FRANCISCO', 'VELHO BARREIRO', 'YPIOCA', 'PIRASSUNUNGA', 'PEDRA 90'},
    'CACHAC': {'PIRASSUNUNGA', 'SAGATIBA', 'SAO FRANCISCO', 'YPIOCA', '51', 'PITU', 'VELHO BARREIRO', 'CANINHA', 'ROCA', 'PAULISTANA', 'VILHA VELHA', 'COROTE'},
    'DROPS':  {'HALLS', 'FINI'},
    'CR LEITE': {'ITALAC', 'NESTLE', 'MOCOCA', 'PIRACANJ', 'QUATA', 'LIDER', 'ITAMBE', 'PIRACANJUBA'},
    'CERV': {'SKOL', 'BRAHMA', 'ANTARCTICA', 'HEINEKEN', 'CORONA', 'ITAIPAVA', 'AMSTEL', 'BUDWEISER', 'SPATEN'},
    'BEB': {'51', 'SKOL', 'SMIRNOFF', 'FRUIT SHOOT', 'GUARAVITON', 'ITALAC', 'STEMPEL'},
    'CONHAQUE': {'DOMECQ', 'DOMEC', 'DREHER', 'PRESIDENTE', 'POLINHO', 'SAO JOAO DA BARRA'},
    'LAVA ROUPA': {'OMO', 'SURF', 'TIXAN', 'BRILHANTE', 'ARIEL', 'ACE', 'YPE', 'YPÊ', 'URCA', 'ASSIM', 'MINUANO'},
    'AMAC': {'DOWNY', 'COMFORT', 'FOFO', 'AMACITEL', 'VIDA MACIA', 'BABYSOFT', 'BABY SOFT', 'ZERO A DOIS', 'ZEROADOIS', 'GIRANDO SOL', 'URCA', 'MONBIJU', 'SOBRILHO', 'SUPREMA', 'TUFF', 'ZULU', 'CANDURA', 'YPE', 'YPÊ'},
    'SANITARIA': {'CANDURA', 'CANDIDA', 'QBOA', 'Q-BOA', 'Q BOA', 'YPE', 'YPÊ', 'BARBAREX', 'SUPERCANDIDA', 'BRILUX', 'ALPES', 'GIRANDO SOL'},
    'PAPEL HIG': {'NEVE', 'PERSONAL', 'ELITE', 'MILI', 'COTTON', 'SUBLIME', 'DUETTO', 'DELUXE', 'MAX', 'SCOTT', 'MIMMO', 'NOBRE', 'ISAPEL', 'FANCY', 'PALOMA', 'FLORAL', 'QUALITE', 'PRIMACARE', 'FOLHALEV', 'TIFFY', 'FAMILIAR', 'FOFINHO', 'PRIMAVERA'},
    'PAPEL HIGIENICO': {'NEVE', 'PERSONAL', 'ELITE', 'MILI', 'COTTON', 'SUBLIME', 'DUETTO', 'DELUXE', 'MAX', 'SCOTT', 'MIRIMMO', 'NOBRE', 'ISAPEL', 'FANCY', 'PALOMA', 'FLORAL', 'QUALITE', 'FOLHALEV', 'TIFFY', 'FAMILIAR', 'FOFINHO', 'PRIMAVERA'},
    'FILTRO PAPEL': {'3CORACOES', 'BRIGITTA', 'BRITTA', 'MELITTA', 'SENSEO', 'HARIO', 'JAGUARI'},
    'LIMP COALA': {'ALGODAO', 'BAMBU', 'CHA', 'BRANCO', 'CITRONELLA', 'EUCALIPTO', 'EUCAL', 'LAVANDA'},

    # Categorias adicionais — travas de marca para produtos que confundem
    'CALDO': {'MAGGI', 'KNORR'},
    'GOIABADA': {'VAL', 'PREDILECTA', 'XAVANTE', 'BONO', 'CASTANHA', 'CEPERA', 'ROLETTI', 'ANHEMBI'},
    'REPELENTE': {'OFF', 'REPELEX', 'EXPOSIS', 'SBP'},
    'DET': {'YPE', 'YPÊ', 'LIMPOL', 'MINUANO', 'ODD', 'CANDURA', 'CASACLEAN', 'PALMOLIVE', 'FAIRY'},
    'FERMENTO': {'D BENTA', 'DBENTA', 'FERMIX', 'FLEISCHMANN', 'DR OETKER', 'OETKER', 'BIOFLEX'},
    'HASTE': {'COTTONETE', 'JOHNSONS', 'JOHNSON', 'COTONELA'},
    'REPEL': {'OFF', 'REPELEX', 'EXPOSIS', 'SBP'},

    # Categorias com travas de marca
    'ABS': {'ALWAYS', 'INTIMUS', 'SEMPRE LIVRE', 'S LIVRE'},
    'DESINF': {'PINHOSOL', 'PINHOBRIL', 'PINHOTROP', 'LYSOFORM', 'BUFALO', 'URCA', 'SANOL', 'FUZZETO', 'FUZETTO', 'YPE', 'YPÊ', 'CANDURA', 'PATO', 'VEJA', 'UAU', 'HARPIC'},
    'LV LOUCA': {'YPE', 'YPÊ', 'LIMPOL', 'MINUANO', 'ODD', 'CANDURA', 'CASACLEAN', 'PALMOLIVE', 'FAIRY'},
    'MARG': {'QUALY', 'DELICIA', 'CLAYBOM', 'CREMOSY', 'BECEL', 'VIGOR', 'DORIANA', 'AVIACAO'},
    'SABAO PASTA': {'DIPOL', 'UFE', 'YPE', 'YPÊ', 'URCA'},
    'SABAO BARRA': {'ASSIM', 'MINUANO', 'RAZZO', 'UFE', 'YPE'},
    'DESOD': {'REXONA', 'DOVE', 'NIVEA', 'AXE', 'OLDSPICE', 'MONANGE', 'BOZZANO', 'HERBISSIMO', 'ABOVE', 'FRANCIS', 'DAVENE', 'GIOVANNABABY', 'TABU', 'HYDRATTA', 'POTY', 'SKALA', 'SECRET', 'GILLETTE', 'ADIDAS', 'PERSPIREX', 'CORPO A CORPO'},
    'DES':   {'REXONA', 'DOVE', 'NIVEA', 'AXE', 'OLDSPICE', 'MONANGE', 'BOZZANO', 'BOZ', 'HERBISSIMO', 'ABOVE', 'FRANCIS', 'DAVENE', 'GIOV', 'GIOVANNABABY', 'TABU', 'POTY', 'SKALA', 'SECRET', 'GILLETTE', 'ADIDAS', 'PERSPIREX', 'HYDRATTA', 'CORPO A CORPO'},
    'SH': {'PANTENE', 'SEDA', 'DOVE', 'ELSEVE', 'KOLENE', 'DARLING', 'CLEAR', 'JOHNSONS', 'MONANGE', 'NEUTROX', 'PALMOLIVE', 'POTY', 'SKALA', 'GOTADOURADA', 'TRALALA', 'NOVEX', 'OX', 'VULT', 'BARUEL', 'H&S', 'SALON LINE', 'SALONLINE'},
    'COND': {'PANTENE', 'SEDA', 'DOVE', 'ELSEVE', 'KOLENE', 'MONANGE', 'NEUTROX', 'PALMOLIVE', 'POTY', 'SKALA', 'GOTADOURADA', 'NOVEX', 'VULT', 'SALON LINE', 'SALONLINE'},
    'CR TRAT': {'SKALA', 'NOVEX', 'SEDA', 'ELSEVE', 'POTY', 'PANTENE', 'SALON LINE', 'SALONLINE'},
    'SAPONACEO': {'CIF', 'RADIUM', 'SAPOLIO'},
    'SAB': {'DOVE', 'LUX', 'PALMOLIVE', 'FRANCIS', 'JOHNSONS', 'JOHNSON', 'LIVY', 'ALBANY', 'GRANADO', 'PROTEX', 'REXONA', 'NIVEA', 'YPE', 'SIENE', 'MONANGE', 'PHEBO'},
    'INSET': {'BAYGON', 'SBP', 'RAID', 'MATINSET', 'MORTEIN'},
    'FRALDA': {'PAMPERS', 'HUGGIES', 'TURMADAMONICA', 'BABYSEC', 'CREMER', 'MILI', 'PERSONAL'},
    'FRAL': {'PAMPERS', 'HUGGIES', 'TURMADAMONICA', 'BABYSEC', 'CREMER', 'MILI', 'PERSONAL', 'BIGFRAL'},
    'FIO DENT': {'COLGATE', 'ORALB', 'JOHNSONS', 'CONDOR', 'DENTEK'},
    'COPO DESC': {'COPOMAIS', 'COPOSUL', 'CRISTALCOPO', 'CRSITALCOPO', 'KEROCOPO', 'TERMOPOT', 'TOTALPLAST', 'ALTACOPPO', 'FACILITA', 'COPOBRAS', 'COPAZA'},
    'FILME': {'ROYALPACK', 'WYDA', 'TRAMONTINA', 'DOVER ROLL'},
    'TORRADA': {'ADRIA', 'BAUDUCCO', 'MARILAN', 'VISCONTI'},
    'CR DENTAL': {'COLGATE', 'ORALB', 'CLOSEUP', 'SORRISO', 'SENSODYNE'},
    'CR D': {'COLGATE', 'ORALB', 'CLOSEUP', 'SORRISO', 'SENSODYNE'},  # alias pós-normalização
    'ENX BUC': {'LISTERINE', 'CEPACOL', 'CLOSEUP', 'ORALB', 'COLGATE'},
    'MOSTARDA': {'HEINZ', 'HELLMANNS', 'HELLMANN', 'HEMMER', 'QUERO', 'KONSUMO', 'CEPERA', 'OLE', 'PREDILECTA'},
    'ESC DENT': {'COLGATE', 'ORALB', 'CONDOR', 'JOHNSON'},

    # Categorias do PDF — novas
    'MAC INS': {'NISSIN', 'RENATA', 'GALO', 'CUP NOODLES'},
    'ARROZ': {'TIO JOAO', 'CAMIL', 'NAMORADO', 'PRATO FINO', 'KICALDO', 'TIOJOAO'},
    'FEIJAO': {'KICALDO', 'CAMIL', 'CALDO NOBRE', 'BROTO LEGAL', 'NAMORADO'},
    'LEITE UHT': {'ITALAC', 'PIRACANJUBA', 'PIRACANJ', 'PARMALAT', 'ELEGE', 'ITAMBE', 'CCGL', 'NINHO'},
    'LENCO UMED': {'HUGGIES', 'PAMPERS', 'BABYSEC', 'JOHNSONS'},
    'REFRIG': {'COCA COLA', 'PEPSI', 'GUARANA', 'FANTA', 'SPRITE', 'SUKITA', 'ITUBAINA', 'CRUZEIRO'},
    'AGUA': {'CRYSTAL', 'MINALBA', 'BONAFONT', 'LINDOYA', 'INDAIA', 'SFERR'},
    'PAPEL TOALHA': {'KITCHEN', 'SNOB', 'SCOTT', 'YURI', 'SCALA'},
    'TOMATE PELADO': {'POMAROLA', 'PREDILECTA', 'QUERO', 'HEINZ', 'COPEX'},
    'RACAO': {'PEDIGREE', 'GOLDEN', 'SPECIAL DOG', 'WHISKAS', 'FRISKIES', 'PREMIER', 'ROYAL CANIN'},
    'GUARDANAPO': {'KITCHEN', 'SNOB', 'SCOTT'},
    'ALCOOL': {'COPERALCOOL', 'COPERACOOL', 'FLOPS', 'SAFRA', 'TUPI', 'ZULU'},
    'ACENDEDOR': {'TUPI', 'ZULU', 'TAKA FOGO'},
    'APERITIVO': {'CAMPARI', 'DA ROCHA', 'DAROCHA'},
    'LIMP': {'VEJA', 'UAU', 'UAL', 'PATO', 'FLASH', 'MR MUSCULO', 'BUFALO', 'AJAX', 'LYSOFORM', 'SCOTCH', 'BRILHOME'},
    'CHA': {'LEAO', 'REAL', 'MATTE REAL', 'MATE REAL'},
    'AVEIA': {'ITALAC', 'NESTLE', 'QUAKER', 'NESTUM', 'NEILAR', 'TRES CORACOES', '3 CORACOES'},
    'LEITE EM PO': {'ITAMBE', 'PIRACANJ', 'PIRACANJUBA', 'CCGL', 'LEITESOL', 'AURORA', 'NINHO', 'ITALAC', 'NESTLE'},
    'SUSTAGEM': {'SUSTAGEM', 'SUSTAGEN'},
    'PAPEL ALUM': {'WYDA', 'BRICOFLEX', 'KIKO'},
    'PAPEL': {'MELLO', 'WYDA', 'CHAMEQUINHO'},
    'SAND': {'HAV', 'HAVAIANAS'},
    'MOLHO': {'BILLY JACK', 'KISABOR', 'HEINZ', 'HEMMER', 'KNORR', 'POMAROLA', 'PREDIL', 'PREDILECTA', 'QUERO', 'FUGINI', 'TARANTELLA', 'SALSARETTI', 'LIZA'},
    'GELATINA': {'OETKER', 'DR OETKER', 'ROYAL', 'SOL', 'NEILAR'},
    'C.M': {'ALCAFOOD', 'KELLOGGS', 'NESTLE', 'NESCAU', 'NESTON', 'SUCRILHOS'},
    'BARRA': {'3 CORACOES', '3CORACOES'},
    'PIL': {'PANASONIC', 'DURACELL', 'RAYOVAC', 'ELGIN'},
    'SALG': {'LUCKY', 'TORCIDA', 'PIRAQUE', 'KARITOS', 'PRINGLES', 'MUFFATO'},
    'SAPON': {'SAPOLIO', 'CIF', 'RADIUM'},
    'TOALHA': {'KITCHEN', 'SCALA', 'HUGGIES', 'MEU BEBE', 'TROPOLINO'},
    'CHICLE': {'BUBBALOO', 'TRIDENT'},
    'GUARD': {'COQUETEL', 'KITCHEN', 'MASTER CHEFF'},
    'REMOVEDOR': {'BUFALO', 'ECOBUFALO', 'KM', 'SUPREMA', 'TACOLAC'},
    'SACO': {'V FORT', 'EMBAL', 'WYDA', 'BRICOFLEX', 'ZIPAG'},
    'T MANCHA': {'VANISH', 'CANDURA', 'PLUSH'},
    'CERA': {'BRILHO FACIL', 'TACOLAC', 'GIRANDO SOL', 'GIOCA'},
    'ESPONJA': {'WISH', 'LIMPPANO', 'S BRITE', 'YPE', 'CONDOR'},
    'GARR': {'INVICTA'},
    'LAMP': {'ELGIN'},
    'PAST': {'TICTAC'},
    'APAR': {'BIC', 'PREST', 'GILLETTE', 'VENUS'},
    'BATATA': {'PRINGLES', 'CROCANTE', 'KARI KARI', 'MUFFATO'},
    'DOCE': {'AVIACAO', 'TRIANGULO', 'OLIVEIRA', 'ITALAC'},
    'QUEROSENE': {'BUFALO'},
    'RUM': {'MONTILLA'},
    'SAQUE': {'AZUMA KIRIN'},
    'ALV': {'VANISH'},
    'AZ': {'V FERTIL', 'VALE FERTIL', 'RIVOLI'},
    'BALA': {'HALLS', 'BUBBALOO', 'DORI'},
    'CAPSULA': {'PILAO', 'LOR', 'TRES', '3 CORACOES'},
    'CATUABA': {'RANDON', 'SELVAGEM'},
    'CREME': {'KISABOR', 'CESIBON', 'KNORR', 'MAGGI'},
    'ESC': {'MEDFIO', 'ORALB', 'COLGATE', 'CONDOR'},
    'KEEP': {'KEEP'},
    'LUVA': {'DANNY'},
    'TENYS': {'BARUEL'},
    'APERIT': {'APEROL', 'CYNAR'},
    'COB': {'OETKER', 'DR OETKER'},
    'COPO': {'CRISTALCOPO'},
    'POTE': {'CRISTALCOPO'},
    'PRATO': {'CRISTALCOPO'},
    'ESPUM': {'CHANDON'},
    'GIN': {'GORDONS', 'TANQUERAY'},
    'LA ACO': {'BOMBRIL', 'ASSOLAN'},
    'LUSTRA': {'DESTAC', 'POLIFLOR'},
    'PACOCA': {'GUIMARAES'},
    'PANO': {'TOALEX', 'SCOTT'},
    'PO PREP': {'ITALAC', 'NESQUIK'},
    'ROUPA INT': {'MOVIMENT'},
    'SELETA': {'QUERO', 'PREDILECTA'},
    'SOPAO': {'KISABOR'},
    'POLPA': {'POMODORO', 'PREDILECTA', 'QUERO'},
    'SABAO': {'UFE', 'URCA', 'YPE', 'MINUANO', 'ASSIM'},
    'VERMOUTH': {'CONTINI'},
}

SUBTIPOS_EXCLUSIVOS = [
    {'SACARINA', 'SUCRALOSE', 'STEVIA', 'XILITOL', 'FRUTOSE', 'CICLAMATO', 'ERITRITOL'},
    {'POTE', 'COPO', 'BALDE', 'BISNAGA', 'FRASCO'},  # PT normalizado para POTE
    {'SACHE', 'SACHET', 'SACHÊ', 'POUCH', 'REFIL', 'REFILL'},
    {'AEROSSOL', 'AEROSOL', 'SPRAY'},
    {'ROLLON'},   # roll-on (já unificado na normalização)
    {'STICK', 'BASTAO', 'BASTÃO'},

    # Desodorante — tipo de aplicação mutuamente exclusivo
    {'DESOD AERO', 'DESOD ROL', 'DESOD CR', 'DES SPRAY'},

    # Azeite – tipo e linha são produtos diferentes
    {'EXTRAVIRGEM'},          # extravirgem ≠ qualquer azeite sem essa palavra
    {'SUAVE', 'INTENSO'},     # linhas Gallo (Suave ≠ Reserva ≠ ExtraVirgem)
    {'RESERVA'},
    {'DIA A DIA', 'DIAADI'},  # sub-marca Gallo ≠ tradicional ≠ extravirgem

    # Embalagem azeite (vidro ≠ lata ≠ pet) — todos no mesmo grupo
    {' VD ', ' VIDRO ', ' LT ', ' LATA ', ' PET '},

    # Biscoito – NEW WAFF ≠ WAFER (produtos diferentes Piraque)
    {'NEW WAFF', 'WAFER'},

    # Chocolate – linhas/tipos são produtos diferentes (mesma marca, tipos ≠)
    {'DIPLOMATA', 'ALPINO', 'CRUNCH', 'GALAK', 'SUFLAIR', 'CHARGE', 'CHOKITO',
     'PRESTIGIO', 'KIT KAT', 'KITKAT', 'TALENTO', 'SERENATA', 'BATON',
     'SONHO DE VALSA', 'OURO BRANCO', 'DIAMANTE NEGRO',
     'LAKA', 'SHOT', 'AMARO', 'FIVE STAR', 'BISAO', 'TRENTO',
     'AO LEITE', 'MEIO AMARGO', 'BRANCO', 'CROCANTE', 'RECH'},

    # Óleo – tipo de óleo são produtos diferentes (soja ≠ canola ≠ girassol ≠ milho)
    {'SOJA', 'CANOLA', 'GIRASSOL', 'MILHO'},

    # Cobertura sorvete vs pó sorvete
    {'COB SORV', 'PO SORVETE'},

    # Café – solúvel ≠ torrado/moído
    {'SOLUVEL', 'SOL'},

    # Lava-roupa – pó ≠ líquido
    {'LAVA ROUPA PO', 'LAVA ROUPA LIQ'},

    # Chocolate – % cacau diferente = produto diferente
    {'40%', '60%', '70%', '80%', '85%', '90%', '95%'},
    {'INTEGRAL', 'SEMIDESNATADO', 'SEMI', 'DESNATADO', '0% LACTOSE', 'ZERO LACTOSE', 'Z LAC'},

    # Suco / Refresco – concentrado ≠ pronto-para-beber ≠ com açúcar ≠ sem açúcar
    {'CONC'},    # concentrado — não bate com TP (pronto)
    {'LIGHT', 'S/ACUC', 'SEMACUCAR', 'ZERO'},  # sem açúcar ≠ com açúcar

    # Atum – corte diferente = produto diferente
    {'SOLIDO', 'PEDACO', 'RALADO'},             # tipos de corte mutuamente exclusivos
    {'OLEO', 'NATURAL', 'TOMATE'},              # meio de conserva

    # Milho / Ervilha – embalagem importa
    {'LT'},     # lata — não bate com sachê/outra embalagem sem LT

    # Limpeza — subcategorias mutuamente exclusivas (NOVO)
    {'DESINF', 'DESINFETANTE', 'MULTIUSO', 'LIMP M U', 'DESENG', 'DESENGORDURANTE', 'BANHEIRO', 'LV LOUCA'},

    # Papel Higiênico — linhas/tipos diferentes (NOVO)
    {'SUPREME', 'TQ SEDA', 'TOQ SEDA'},
    {'FOLHA DUPLA', 'FOLHA SIMPLES', 'F DUPLA', 'F SIMPLES'},
    {'ALUM', 'ALUMINIO', 'MANTEIGA', 'SULF'},

    # Sabão — tipos diferentes (NOVO)
    {'PASTA', 'BARRA', 'PO', 'LIQ'},

    # Fraldas — tamanhos mutuamente exclusivos
    {'RN', 'PP', 'XP'},
    {'JUMBO', 'HIPER', 'MEGA', 'GIGA', 'ECONOM'},

    # Categorias totalmente incompatíveis — nunca podem casar
    {'FILTRO', 'FILME'},
    {'MAIONESE', 'KETCHUP', 'MOSTARDA'},

    # Tomate – polpa ≠ molho ≠ extrato (produtos diferentes)
    {'POLPA TOM', 'MOL TOM', 'EXTR TOM'},

    # Macarrão – cortes diferentes = produtos diferentes
    {'PARAF', 'SPAG', 'CURTO', 'PENNE', 'ESPAGUETE', 'GRAVATA', 'AVE MARIA',
     'FUSILLI', 'FETTUCCINE', 'LASANHA'},

    # Tomate pelado ≠ molho/extrato/polpa
    {'TOMATE PELADO', 'MOL TOM', 'EXTR TOM', 'POLPA TOM'},
    {'INSET', 'LIMP', 'DESINF'},
    {'FRALDA', 'PAPEL HIG'},
    {'FRAL', 'PAPEL HIG'},
    {'VODKA', 'APERITIVO', 'CACHAC', 'AGUARD', 'CONHAQUE', 'WHISKY'},
    {'BEB', 'VODKA', 'APERITIVO', 'CACHAC', 'AGUARD', 'CONHAQUE', 'WHISKY', 'CERV', 'VIN'},
    {'FIO DENT', 'ESC DENT', 'CR DENTAL', 'CR D'},
    {'TORRADA', 'BISC', 'PAO'},
    {'BISC', 'SALG', 'BATATA', 'TORRADA', 'CHICLE', 'BALA', 'PAST'},
    {'MAC INS', 'MACAR'},   # macarrão instantâneo ≠ massa seca
    {'ARROZ', 'FEIJAO'},    # arroz ≠ feijão
    {'COPO', 'POTE', 'PRATO', 'DES', 'DESOD'},
    {'CERA', 'REMOVEDOR', 'QUEROSENE', 'DESINF', 'LIMP', 'SAPON'},
    {'TOALHA', 'PAPEL HIG', 'LENCO UMED'},

    # Arroz — tipos mutuamente exclusivos (PDF)
    {'PARBOILIZADO', 'PARBO'},

    # Feijão — tipos mutuamente exclusivos (PDF)
    {'CARIOCA', 'PRETO', 'FRADINHO', 'JALO', 'BRANCO', 'VERMELHO'},

    # Cerveja — embalagem mutuamente exclusiva (PDF)
    {'LN', 'LONGNECK', 'LONG NECK'},

    # Creme dental — linha/fórmula são produtos diferentes
    # Ex: LUMINOUS WHITE ≠ MPA ≠ TOTAL12 ≠ NEUTRACUCAR ≠ SENSIVEL
    {'LUMINOUS WHITE', 'MPA', 'TOTAL12', 'NAT',
     'NEUTRACUCAR', 'SENSIVEL',
     'TRIPLA ACAO', 'WHITENING', 'ANTICARIE', 'MAXFRESH', 'EXTRAFRESH'},

    # Aparelho de barbear — linhas diferentes da mesma marca nao devem cruzar
    {'SOLEIL', 'SENSITIVE', 'INTENSITY', 'COMFORT', 'VENUS', 'PRESTOBARBA'},

    # Pilhas/baterias — tecnologia diferente nao cruza
    {'ALC', 'ALCALINA', 'COMUM'},
]

# Tamanhos de fralda — mutuamente exclusivos
TAMANHOS_FRALDA = {'P', 'M', 'G', 'PQ', 'MD', 'GD', 'XG', 'XXG', 'XXXG', 'RN', 'PP', 'XP'}

TOKENS_VARIANTE_COMUNS = {
    'ABACAXI', 'ACEROLA', 'ACONCHEGO', 'ALGODAO', 'ALHO', 'AMENDOA', 'AMORA',
    'AZUL', 'BABOSA', 'BAMBU', 'BANANA', 'BAUNILHA', 'BICARBONATO', 'BIOTINA',
    'BRANCO', 'BRISA', 'CACAU', 'CAJU', 'CAMOMILA', 'CAMPESTRE', 'CANELA',
    'CAPIM', 'CAPPUCCINO', 'CEREJA', 'CHA', 'CHOCOLATE', 'CITRICO', 'CITRONELA',
    'CLEAR', 'COCO', 'COLONIA', 'CRISTAL', 'CUIDADO', 'ERVA', 'EUCAL',
    'EUCALIPTO', 'FLOR', 'FLORAL', 'FRAMBOESA', 'FRESCOR', 'FRESH', 'GLICERINA',
    'GOIABA', 'GRAPE', 'GUARANA', 'HIALURONICO', 'HORTELA', 'INTENSO',
    'INVISIBLE', 'JASMIM', 'KARITE', 'LARANJA', 'LAVANDA', 'LIMAO', 'LIRIOS',
    'MACA', 'MACIEZ', 'MAMAE', 'MANGA', 'MARACUJA', 'MARINE', 'MEL',
    'MELANCIA', 'MENTA', 'MICELAR', 'MORANGO', 'NEUTRO', 'NOZES', 'ORQUIDEA',
    'PESSEGO', 'PIMENTA', 'PINHO', 'POWDER', 'PRETO', 'PRIMAVERA', 'PURO',
    'RESTAURACAO', 'ROSA', 'ROSAS', 'ROXO', 'SEDA', 'SPORT', 'SUPREME',
    'TALCO', 'TANGERINA', 'TURQUESA', 'TUTTI', 'UVA', 'VERAO', 'VERDE',
    'PICANTE', 'TRAD',
    'VERMELHA', 'VERMELHO', 'VERMELHAS', 'VERMELHOS',
    'AMARELA', 'AMARELO', 'INCOLOR', 'ARDOSIA', 'DOURADO', 'DOURADA',
    'YOGURTE',
    # Fragrâncias de desodorante/perfume
    'CANDY', 'VANILLA', 'FIERCE', 'PASSION', 'OCEAN', 'ENERGY',
    'EXTREME', 'DETOX', 'CLASS', 'FRESH', 'VANILLE', 'CARVA',
    'PROTECAO', 'SECA', 'SENSIVEL', 'LOVE', 'MOVING', 'ALUM',
    'BLACK', 'ACTIVE', 'INVISI',
    # Variantes shampoo/condicionador (SEDA, PANTENE, etc.)
    'HIDRATACAO', 'CERAMIDAS', 'NUTRICAO', 'BOMBA', 'BRILHO',
    'LISO', 'CACHEADO', 'ONDULADO', 'FRIZZ', 'RECONSTRUCAO',
}

TOKENS_VARIANTE_DESCARTAR = {'TRADICIONAL', 'TRAD', 'ORIGINAL', 'CLASSICO', 'CLASSICA', 'NORMAL', 'COMUM', 'TIPO', 'SABOR', 'FRAGRANCIA', 'FRAGANCIA', 'ESSENCIA', 'LINHA', 'UNICO', 'ESPECIAL', 'EXTRA', 'FORTE', 'SUAVE', 'INTENSO'}
TOKENS_VARIANTE_FORTES = {
    'ZERO', 'LIGHT', 'INTEGRAL', 'DESNATADO', 'SEMIDESNATADO', 'SEMI',
    'SOLUVEL', 'CONC', 'NATURAL', 'TOMATE', 'OLEO', 'SOLIDO', 'PEDACO',
    'RALADO', 'AEROSOL', 'SPRAY', 'ROLLON', 'ROLL', 'ON', 'STICK',
    'SACHE', 'REFIL', 'POUCH', 'POTE', 'COPO', 'BALDE', 'BISNAGA',
    'FRASCO', 'EXTRAVIRGEM', 'RESERVA', 'SUCRALOSE', 'SACARINA', 'STEVIA',
    'XILITOL', 'FRUTOSE', 'CICLAMATO'
}

# ─────────────────────────────────────────────
# INTELIGÊNCIA DE MARCAS
# ─────────────────────────────────────────────

inteligencia_marcas = {
            # Amaciante
            "DOWNY": "AMACIANTE", "COMFORT": "AMACIANTE", "FOFO": "AMACIANTE",
            "AMACITEL": "AMACIANTE", "LENOR": "AMACIANTE",

            # Lava-roupa
            "OMO":       "LAVA ROUPA", "TIXAN":     "LAVA ROUPA", "SURF":      "LAVA ROUPA",
            "BRILHANTE": "LAVA ROUPA", "ARIEL":     "LAVA ROUPA", "ACE":       "LAVA ROUPA",
            "BOLD":      "LAVA ROUPA", "YPE":       "LAVA ROUPA", "YPÊ":       "LAVA ROUPA",
            "COQUEL":    "LAVA ROUPA",

            # Água Sanitária / Alvejante
            "CANDURA":   "SANITARIA", "CANDIDA":   "SANITARIA", "QBOA":      "SANITARIA",
            "Q BOA":     "SANITARIA", "Q-BOA":     "SANITARIA",
            "GIRANDO SOL": "SANITARIA", "BARBAREX":  "SANITARIA", "BRILUX":    "SANITARIA",

            # Desinfetante
            "PATO":      "DESINFETANTE", "VEJA":      "LIMPADOR",
            "LYSOFORM":  "DESINFETANTE", "DOMESTOS":  "DESINFETANTE",

            # Detergente Louça
            "LIMPOL":    "DETERGENTE", "MINUANO":   "DETERGENTE", "PALMOLIVE": "DETERGENTE",
            "FAIRY":     "DETERGENTE", "YPÊ":       "LAVA ROUPA",   # também faz detergente, mas lava roupa é o principal

            # Azeite
            "ANDORINHA": "AZEITE", "GALLO":     "AZEITE", "BORGES":    "AZEITE",
            "CARBONELL": "AZEITE", "COCINERO":  "AZEITE", "FILIPPO BERIO": "AZEITE",
            "FILLIPO BERIO": "AZEITE", "COLAVITA":  "AZEITE", "DELEYDA":   "AZEITE",
            "LA ESPANOLA": "AZEITE", "MONINI":    "AZEITE", "ESPORAO":   "AZEITE",
            "DE CECCO":  "AZEITE", "PAGANINI": "AZEITE",

            # Óleos vegetais
            "LIZA": "OLEO", "SOYA": "OLEO", "SALADA": "OLEO", "GOLDEN": "OLEO",

            # Molho
            "ELEFANTE": "EXTRATO TOMATE", "POMAROLA":  "MOLHO TOMATE",
            "QUERO":     "MOLHO TOMATE", "HEINZ":     "KETCHUP",
            "HELLMANS":  "MAIONESE", "HELLMANN": "MAIONESE",

            # Limpeza
            "OMO": "LAVA ROUPA", "SURF": "LAVA ROUPA", "TIXAN": "LAVA ROUPA",
            "BRILHANTE": "LAVA ROUPA", "ARIEL": "LAVA ROUPA", "ACE": "LAVA ROUPA",
            "YPE": "LAVA ROUPA", "YPÊ": "LAVA ROUPA", "DOWNY": "AMACIANTE",
            "VANISH": "LIMPEZA", "VEJA": "LIMPADOR", "PATO": "LIMPADOR",
            "LIMPOL": "DETERGENTE", "MINUANO":   "DETERGENTE",
            "QBOA": "SANITARIA", "CANDURA": "SANITARIA", "GIRANDO SOL": "SANITARIA",
            "LYSOFORM": "DESINFETANTE", "DOMESTOS": "DESINFETANTE", "BARBAREX": "SANITARIA",

            # Desodorante
            "REXONA":    "DESOD", "DOVE":      "DESOD", "NIVEA":     "DESOD",
            "AXE":       "DESOD", "GILLETTE":  "DESOD", "ADIDAS":    "DESOD",
            "OLD SPICE": "DESOD", "SECRET":    "DESOD", "PERSPIREX": "DESOD",
            "MONANGE":   "DESOD", "BOZZANO":   "DESOD", "HERBISSIMO": "DESOD",
            "ABOVE":     "DESOD",
            "HYDRATTA":  "DESOD",

            # Cabelo
            "SALON LINE": "SH", "SALONLINE": "SH",

            # Perfume / Colônia
            "BOTICARIO": "DEO COLONIA", "BOTICÁRIO": "DEO COLONIA", "NATURA": "DEO COLONIA",
            "AVON":      "DEO COLONIA", "FLORATTA":  "DEO COLONIA", "MALBEC":    "DEO COLONIA",
            "ARBO":      "DEO COLONIA", "EGEO":      "DEO COLONIA", "KAIAK":     "DEO COLONIA",
            "LUNA":      "DEO COLONIA", "PARIS ELYSEES": "PERFUME",
            "JEQUITI":   "DEO COLONIA",
        }

_CATS_FIXAS = {'MOSTARDA', 'CATCHUP', 'KETCHUP', 'MAIONESE', 'AZEITE', 'OLEO',
               'VINAGRE', 'REFRESCO', 'REFR', 'SUCO', 'ACHOC',
               'LEITE', 'CAFE', 'BISC', 'CHOC', 'TORRADA',
               'MIST', 'FERMENTO', 'AVEIA', 'PAPEL', 'CALDO', 'EXTR',
               'GOIABADA', 'REPELENTE', 'DET', 'SH', 'COND',
               'SAB', 'DESOD', 'TOMATE', 'RACAO',
               'AMIDO', 'LIMP', 'ALCOOL', 'REMOVEDOR', 'ARROZ', 'FEIJAO'}

_MULTI_CATS = {
    'YPE': {'DET', 'LV LOUCA', 'DETERGENTE', 'SANIT', 'LIMP'},
    'YPÊ': {'DET', 'LV LOUCA', 'DETERGENTE', 'SANIT', 'LIMP'},
    'MINUANO': {'DET', 'LV LOUCA', 'DETERGENTE', 'AMAC'},
    'CANDURA': {'DET', 'LV LOUCA', 'DETERGENTE', 'SANIT', 'LIMP', 'LAVA ROUPA'},
}

SABORES_CALDO = {
    'BACON', 'CARNE', 'COSTELA', 'GALINHA', 'FRANGO', 'LEGUMES', 'PICANHA',
    'CAMARAO', 'PEIXE', 'FEIJAO', 'COSTELINHA',
}

_CAT_EQUIV_SEGURA = {
    'DET': 'LV LOUCA',
    'DETERGENTE': 'LV LOUCA',
    'LV LOUCA': 'LV LOUCA',
    'DESINFETANTE': 'DESINF',
    'SABAO': 'SAB',
    'BISCOITO': 'BISC',
    'AGUARDENTE': 'AGUARD',
    'CACHACA': 'CACHAC',
    'SHAMPOO': 'SH',
    'CONDICIONADOR': 'COND',
    'REPELENTE': 'REPEL',
    'MACAR': 'MAC',
    'MAIONESE': 'MAION',
    'POLPA TOM': 'MOL TOM',
    'POLPA': 'MOL TOM',
    'FRALDA': 'FRAL',
    'PAPEL HIGIENICO': 'PAPEL HIG',
    'CATCHUP': 'KETCHUP',
    'T MANCHA': 'ALV',
    'SABAO BARRA': 'SABAO',
    'SABAO PASTA': 'SABAO',
}

_CATEGORIAS_FORTES = (
    ('AGUA SANITARIA', ('AGUA SANIT', 'AGUA SAN ', 'SANITARIA', 'QBOA', 'Q-BOA')),
    ('ALVEJANTE', ('ALVEJ', 'ALV ', 'T MANCHA', 'VANISH')),
    ('ALCOOL', ('ALCOOL',)),
    ('AMAC', ('AMAC', 'AMACIANTE')),
    ('APAR', ('APAR', 'BARB')),
    ('CREME DENTAL', ('CR D ', 'CR DENT', 'CREME DENT')),
    ('CREOLINA', ('CREOLINA',)),
    ('DESINF', ('DESINF', 'PINHOSOL', 'PINHOBRIL', 'PINHOTROP', 'HARPIC')),
    ('DETERGENTE LOUCA', ('DET ', 'DETERG', 'LV LOUCA', 'LAVA LOUCA')),
    ('FRAL', ('FRAL', 'FRALDA')),
    ('INSET', ('INSET', 'MATINSET', 'MATA INSET', 'REPEL')),
    ('LAVA ROUPA', ('LAVA ROUPA', 'LV ROUPA', 'SABAO PO', 'SAB PO')),
    ('LIMPADOR', ('LIMP ', 'LIMPADOR', 'MULTIUSO', 'VEJA M U')),
    ('LIMPA VIDRO', ('LIMPA VID', 'LIMP VID')),
    ('LUSTRA MOVEL', ('LUSTRA', 'LUST MOV')),
    ('SAPONACEO', ('SAPON', 'SAPOLIO', 'SAPOLEO')),
    ('VINHO', ('VIN ', 'VINHO')),
)

_FRAGRANCIAS_LIMPEZA = {
    'LAVANDA': {'LAVANDA', 'LAV', 'LAVANDER'},
    'EUCALIPTO': {'EUCALIPTO', 'EUCAL'},
    'LIMAO': {'LIMAO', 'LEMON', 'CITRUS', 'CITRICO'},
    'FLORAL': {'FLORAL', 'FLOR'},
    'TALCO': {'TALCO'},
    'NEUTRO': {'NEUTRO'},
    'AZUL': {'AZUL', 'BLUE'},
    'ROSA': {'ROSA', 'ROSAS'},
    'PRIMAVERA': {'PRIMAVERA'},
    'COCO_BAUNILHA': {'COCO BAUNILHA', 'COCO', 'BAUNILHA', 'VANILLA'},
    'ALGODAO': {'ALGODAO'},
    'AMENDOAS': {'AMENDOA', 'AMENDOAS'},
    'ORIENTAL': {'ORIENTAL', 'ORIENT'},
}

# ─────────────────────────────────────────────
# FUNÇÕES STANDALONE
# ─────────────────────────────────────────────

def limpar_ean(ean):
        """Normaliza EAN/GTIN para comparação exata.

        Aceita números vindos do Excel como float/notação científica e textos com
        máscara, espaços, hífen, apóstrofo ou caracteres invisíveis.
        """
        if ean is None:
            return ""

        s = str(ean).strip()
        if not s or s.lower() in {"nan", "none", "null"}:
            return ""

        s = s.replace("\u00a0", " ").replace("\ufeff", "").strip().strip("'\"")

        try:
            if re.fullmatch(r"[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?", s.replace(" ", "")):
                normalized = s.replace(" ", "").replace(",", ".")
                digits = str(int(float(normalized)))
                return digits if 8 <= len(digits) <= 14 else ""
        except (ValueError, OverflowError):
            pass

        digits = re.sub(r"\D", "", s)
        if 8 <= len(digits) <= 14:
            return digits

        for match in re.findall(r"\d{8,14}", s):
            return match

        return ""

def normalizar_nome(nome):
        """Normalização completa v4.0 — Turbo + Ajustes v5.0 + HTML decode"""
        if not nome or not nome or str(nome).lower() == 'nan':
            return ""
        nome = unicodedata.normalize('NFKD', str(nome)).encode('ASCII', 'ignore').decode('utf-8')
        nome = nome.upper().strip()

        # 0-pre. DECODIFICAÇÃO DE HTML ENTITIES (vindo de Excel/XML)
        nome = nome.replace('&AMP;', '&')
        nome = nome.replace('&amp;', '&')
        nome = nome.replace('&LT;', '<')
        nome = nome.replace('&GT;', '>')
        nome = nome.replace('&QUOT;', '"')
        nome = nome.replace('&NBSP;', ' ')
        nome = nome.replace("HELLMANN'S", "HELLMANNS")
        nome = nome.replace("HELMANNS", "HELLMANNS")

        # 0. SINÔNIMOS DE PREFIXO — alinha cotação com a base de preços
        # Cada tupla: (padrão regex no início do nome, substituto)
        _SINONIMOS = [
            # ── Papel higiênico ─────────────────────────────────────────
            (r'^PAP\.?\s+HIG\.?',             'PAPEL HIG'),
            (r'^PAPEL\s+ALUMINIO\b',          'PAPEL ALUM'),
            (r'^PAPEL\s+TOALHA\b',            'TOALHA PAP'),
            # ── Alvejante / Vanish ──────────────────────────────────────
            (r'^VANISH\b',                    'ALV VANISH'),
            (r'^TIRA\s+MANCHAS?\b',           'T MANCHA'),
            # ── Saponáceo ───────────────────────────────────────────────
            (r'^SAP[OO]LEO\b',                'SAPON SAPOLIO'),
            (r'^SAP[OO]LIO\b',                'SAPON SAPOLIO'),
            # ── Limpeza ─────────────────────────────────────────────────
            (r'^LIMPA\s+FORNO',               'LIMP FORNO'),
            (r'^LIMPA\s+ALUM',                'LIMP ALUMINIO'),
            (r'^TIRA\s+LIM',                  'LIMP VEJA X14'),
            # ── Desentupidor ────────────────────────────────────────────
            (r'^DESENTUPIDOR\b',              'DESENT PIA'),
            # ── Sabão pedra → SABAO ─────────────────────────────────────
            (r'^SAB\.?\s+PE[DC]\.?',           'SABAO'),
            # ── Sabão pó → LAVA ROUPA PO ────────────────────────────────
            (r'^SAB\.?\s+P[OO]\b',             'LAVA ROUPA PO'),
            (r'^SABAO\s+EM\s+P[OO]',           'LAVA ROUPA PO'),
            # ── Sabão em pasta ──────────────────────────────────────────
            (r'^SABAO\s+EM\s+PASTA',           'SABAO PASTA'),
            (r'^SAB[OA]O\s+PASTA',             'SABAO PASTA'),
            # ── Fralda abreviada na base ────────────────────────────────
            (r'^FRALDA\b',                     'FRAL'),
            # ── Amaciante concentrado ───────────────────────────────────
            (r'^AMAC\.?\s+(COMFORT|DOWNY)',    'AMAC CONC'),
            # ── Desinf Coala → LIMP COALA ───────────────────────────────
            (r'^DESINF\.?\s+COALA',            'LIMP COALA'),
            # ── Lava roupas plural ──────────────────────────────────────
            (r'^LAVA\s+ROUPAS\b',              'LAVA ROUPA'),
            # ── Inseticida aerosol ──────────────────────────────────────
            (r'^INSET\.?\s+AERO\.?\s+',        'INSET '),
            (r'^MAT\s+INSET\b',                'INSET'),
            # ── Mistura de bolo → MIST BOLO ─────────────────────────────
            (r'^MISTURA\s+DE\s+BOLO\b',        'MIST BOLO'),
            (r'^CREME\s+DE\s+CEBOLA\b',         'CREME CEBOLA'),
            (r'^EXTRATO\s+DE\s+TOMATE\b',       'EXTR TOM'),
            (r'^EXTRATO\s+TOMATE\b',            'EXTR TOM'),
            (r'^EXTRATO\s+ELEFANTE\b',           'EXTR TOM ELEFANTE'),
            (r'^EXTRATO\s+FUGINI\b',             'EXTR TOM FUGINI'),
            (r'^EXTRATO\s+QUERO\b',              'EXTR TOM QUERO'),
            (r'^EXTRATO\s+PREDILECTA\b',         'EXTR TOM PREDILECTA'),
            (r'^EXTRATO\s+OLE\b',                'EXTR TOM OLE'),
            (r'^EXTRATO\s+POMAROLA\b',           'EXTR TOM POMAROLA'),
            (r'^EXTRATO\s+SALSARETTI\b',         'EXTR TOM SALSARETTI'),
            (r'^EXTRATO\s+SALSERETTI\b',         'EXTR TOM SALSARETTI'),
            (r'^GELATINA\b',                   'GELATINA'),
            (r'^PILHA\b',                      'PIL'),
            (r'^BATERIA\b',                    'PIL'),
            (r'^CEREAL\s+MATINAL\b',           'C.M'),
            (r'^CEREAL\b',                     'C.M'),
            (r'^SALGADINHO\b',                 'SALG'),
            (r'^SARDINHA\b',                    'SARD'),
            (r'^GUARDANAPO\b',                 'GUARD'),
            (r'^SACO\s+LIXO\b',                'SACO LIX'),
            (r'^LUVA\b',                       'LUVA'),
            # ── Bombom → CHOC (coloca na categoria correta) ─────────────
            (r'^BOMBOM\b',                     'CHOC'),
            # ── Nectar → SUCO ───────────────────────────────────────────
            (r'^NECTAR\b',                     'SUCO'),
            (r'^NECTA\b',                      'SUCO'),
            # ── Nescau → ACHOC (achocolatado pó) ────────────────────────
            (r'^NESCAU\b',                     'ACHOC NESCAU'),
            # ── Sustagen → SUSTAGEM ─────────────────────────────────────
            (r'^SUSTAGEM\b',                   'SUSTAGEM'),
            (r'^SUSTAGEN\b',                   'SUSTAGEM'),
            (r'^ACHOC\.?\s+TODD\b',            'ACHOC TODDY'),
            # ── Toddy sem prefixo → ACHOC TODDY ─────────────────────────
            (r'^TODD\b',                       'ACHOC TODDY'),
            (r'^TODDY\b',                      'ACHOC TODDY'),
            # ── Pinga → CACHAC ──────────────────────────────────────────
            (r'^PINGA\b',                      'CACHAC'),
            # ── Pinho Sol → DESINF PINHOSOL ─────────────────────────────
            (r'^PINHO[AO]\s+SOL\b',               'DESINF PINHOSOL'),
            (r'^PINHA\s+SOL\b',                  'DESINF PINHOSOL'),
            (r'^PINHO\s+BRIL\b',               'DESINF PINHOBRIL'),
            # ── Polpa Pomadoro → POLPA TOM POMODORO ─────────────────────
            (r'^POLPA\s+POMADORO',             'POLPA TOM POMODORO'),
            # ── Pó Royal → FERMENTO ─────────────────────────────────────
            (r'^PO\s+ROYAL\b',                 'FERMENTO D BENTA'),
            # ── Refresco Tang (sem prefixo) ──────────────────────────────
            (r'^REFRESCO\s+TANG\b',            'REFR TANG'),
            # ── Maguary Concentrado → SUCO CONC MAGUARY ─────────────────
            (r'^MAGUARY\s+CONCENTRADO',        'SUCO CONC MAGUARY'),
            # ── Limpador Perfumado UAU → LIMP PERF ──────────────────────
            (r'^LIMPADOR\s+PERFUMADO\s+UAU',   'LIMP PERF CASA PERF'),
            (r'^LIM\.?\s+PERF\.?\s+UAL\b',     'LIMP PERF UAU'),
            (r'^LIM\.?\s+PERF\.?\s+UAU\b',     'LIMP PERF UAU'),
            (r'^LIMPADOR\s+PERF\b',            'LIMP PERF'),
            # ── Limpador Perf Sanol → LIMP PERF ─────────────────────────
            (r'^LIMPADOR\s+PERF\s+SANOL',      'LIMP PERF CASA PERF'),
            # ── Veja Multiuso ────────────────────────────────────────────
            (r'^VEJA\s+MULTIUSO\b',            'LIMP VEJA M U'),
            # ── Vitarella sem prefixo (aceita grafia com 1 ou 2 L) ──────
            (r'^VITARELA\b',                   'BISC VITARELLA'),
            (r'^VITARELLA\b',                  'BISC VITARELLA'),
            # ── Vodka Balalaika ──────────────────────────────────────────
            (r'^VODKA\s+BALALAIKA',            'VODKA LEONOFF'),
            # ── Queijo Ralado Vigor (40G → 50G via sinônimo) ─────────────
            # (peso tratado pelo patch V6 — sem sinônimo aqui)
            # ── Mostarda sem ponto ───────────────────────────────────────
            (r'^MOSTARDA\b',                   'MOSTARDA'),
            # ── Amac aconchego/vida macia ────────────────────────────────
            (r'^AMAC\.?\s+',                   'AMAC '),
            # ── Desodorante abreviado ────────────────────────────────────
            (r'^DESOD\s+AERO\b',                 'DES AERO'),
            (r'^DESOD\s+ROLL',                    'DES ROLL'),
            (r'^DESOD\s+CREME\b',                'DES CREME'),
            (r'^DESOD\s+',                        'DES '),
            # ── Biscoito abreviado ───────────────────────────────────────
            (r'^BISC\.?\s+RECH\.?\s+',          'BISC '),
            (r'^BISC\.?\s+',                   'BISC '),
            # ── Sab abreviado ────────────────────────────────────────────
            (r'^SAB\.?\s+',                    'SAB '),
            # ── v5.0: Prefixos adicionais para melhorar matching ────────
            (r'^LV\s+ROUPA\s+LIQ\b',          'LAVA ROUPA LQ'),
            (r'^LV\s+ROUPA\s+PO\b',           'LAVA ROUPA PO'),
            (r'^LV\s+ROUPA\b',                'LAVA ROUPA'),
            (r'^CR\s+DENTAL\b',               'CR D'),
            (r'^COLGATE\b',                   'CR D COLGATE'),
            (r'^SORRISO\b',                   'CR D SORRISO'),
            (r'^ORAL\s+B\b',                  'CR D ORALB'),
            (r'^CR\s+LEITE\b',                'CR LEITE'),
            (r'^CR\s+PENTEAR\b',              'CR PENTE'),
            (r'^CR\s+TRAT\b',                 'CR TRAT'),
            (r'^ENX\s+BUC\b',                 'ENX BUC'),
            (r'^ESC\s+BANHO\b',               'ESC BANHO'),
            (r'^ESC\s+CABELO\b',              'ESC CAB'),
            (r'^ESC\s+DENT\b',                'ESC DENT'),
            (r'^ESP\s+LOUCA\b',               'ESP LOUCA'),
            (r'^SH\+COND\b',                  'SH COND'),
            (r'^SH\+\s+COND\b',               'SH COND'),
            (r'^AZEITONA\b',                  'AZEITONA'),
            (r'^APERITIVO\b',                 'APERITIVO'),
            (r'^COQUETEL\b',                  'COQUETEL'),
            (r'^DOCE\s+LEITE\b',              'DOCE LEITE'),
            (r'^ARROZ\b',                     'ARROZ'),
            (r'^VINAGRE\b',                   'VINAGRE'),
            (r'^PALITO\s+DENTE\b',            'PALITO DENTE'),
            (r'^RACAO\b',                     'RACAO'),
            (r'^CERA\s+LIQ\b',               'CERA LIQ'),
            (r'^PAPEL\s+ALUM\b',             'PAPEL ALUM'),
            (r'^PANO\s+DE\s+CHAO\b',         'PANO CHAO'),
            (r'^TIRA\s+FERRUGEM\b',          'TIRA FERR'),
            (r'^SODA\s+CAUSTICA\b',          'SODA CAUSTICA'),
            (r'^VINHO\b',                     'VIN'),
            (r'^OLEO\s+DE\s+',               'OLEO '),
        ]
        for _pat, _sub in _SINONIMOS:
            if re.match(_pat, nome):
                _resto = re.sub(_pat, '', nome).strip()
                nome = (_sub + ' ' + _resto).strip()
                break

        # 0b. Corrige vírgulas em números decimais (46,2 → 46.2, 1,5 → 1.5)
        nome = re.sub(r'(\d+),(\d+)', r'\1.\2', nome)
        nome = nome.replace('COCINEIRO', 'COCINERO')
        nome = nome.replace('COPERACOOL', 'COPERALCOOL')
        nome = nome.replace('KERO 1L', 'KERO COCO 1L')
        nome = nome.replace('KERO 200ML', 'KERO COCO 200ML')
        nome = nome.replace('SANGUE DE BOI', 'SANGUEDEBOI')
        nome = nome.replace('SALSERETTI', 'SALSARETTI')
        if nome.startswith('KETCHUP CONSUMO') or nome.startswith('CATCHUP CONSUMO'):
            nome = nome.replace('CONSUMO', 'KONSUMO', 1)
        nome = re.sub(r'\bTPA\b', 'TRIPLA ACAO', nome)
        nome = re.sub(r'\b(AZEITE|OLEO(?:\s+COMPOSTO)?)\s+GALO\b', r'\1 GALLO', nome)

        # 1. Corrige vírgulas em medidas (1,5L -> 1.5L) — redundante após 0b, mas mantém segurança
        nome = re.sub(r'(\d+),(\d+\s*(?:G|KG|ML|L|LT|M|MT|MTS|GR|GRAMAS|GRS|GRAMA))', r'\1.\2', nome)

        # 2. Padroniza GRAMAS — mais abrangente
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*(?:GR|GRAMAS|GRS|GRAMA)\b', r'\1G', nome)
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*G\b', r'\1G', nome)

        # 3. Padroniza KG  (inclui "K" sozinho: 1.6K → 1.6KG)
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*(?:KG|K|KILOS|KGS|QUILO|QUILOS|QUILOGRAMA|QUILOGRAMAS)\b', r'\1KG', nome)

        # 4. Padroniza ML
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*(?:ML|MLS|MILILITRO|MILILITROS)\b', r'\1ML', nome)
        # Fix PDF truncation: 500M → 500ML — APENAS para produtos NÃO de papel/têxtil
        # (PAPEL HIG, PAPEL TOALHA, FILME usam M=metros, não mililitros)
        _is_papel = any(kw in nome for kw in ['PAPEL', 'FILME', 'ALUMINIO', 'PLASTICO'])
        if not _is_papel:
            nome = re.sub(r'\b(\d{2,})M\b', r'\1ML', nome)

        # 5. Padroniza LITROS
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*(?:L|LT|LITRO|LITROS|LTR)\b', r'\1L', nome)
        nome = nome.replace('KERO 1L', 'KERO COCO 1L')

        # 6. Padroniza METROS
        nome = re.sub(r'\b(\d+(?:\.\d+)?)\s*(?:MT|MTS|METROS|METRO)\b', r'\1M', nome)

        # 7. Padroniza UNIDADES do Pacote (C/4 -> C4)
        nome = re.sub(r'\b(?:C/|COM\s+)(\d+)\b', r'C\1', nome)
        # Corrige OCR/extração colada: 500MLGLICERINA -> 500ML GLICERINA
        nome = re.sub(r'(\d+(?:\.\d+)?(?:G|KG|ML|L|M|UN))(?=[A-Z])', r'\1 ', nome)
        nome = re.sub(r'\bC\s+(\d+)\b', r'C\1', nome)
        nome = re.sub(r'\b(\d+)\s*(?:UN|UND|UNDS|UNID|UNIDADES|UNIDADE)\b', r'C\1', nome)

        # 8. Une Nomes Compostos conhecidos
        nome = nome.replace("DONA BENTA", "D BENTA")
        nome = nome.replace("EXTRA FORTE", "EXTRAFORTE")
        nome = nome.replace("EXTRA-FORTE", "EXTRAFORTE")
        nome = nome.replace("EX FORT", "EXTRAFORTE")
        nome = nome.replace("KERO COCO", "KEROCOCO")
        nome = nome.replace("MAIS COCO", "MAISCOCO")
        nome = re.sub(r'\bEXT\s+VIRG(?:EM)?\b', 'EXTRAVIRGEM', nome)
        nome = re.sub(r'\bEXT\s+V\b', 'EXTRAVIRGEM', nome)
        nome = nome.replace("EXTRA VIRGEM", "EXTRAVIRGEM")
        nome = nome.replace("EXTRA-VIRGEM", "EXTRAVIRGEM")
        nome = nome.replace("EXT VIRGEM", "EXTRAVIRGEM")
        nome = nome.replace("EX/VIRGEM", "EXTRAVIRGEM")
        nome = nome.replace("EX/VIRG", "EXTRAVIRGEM")
        nome = nome.replace("EXT V ", "EXTRAVIRGEM ")
        nome = nome.replace("YOG ", "YOGURTE ")
        nome = nome.replace("NEW WAFF", "NEW WAFF")
        nome = nome.replace("NEWAFER", "NEW WAFF")
        nome = nome.replace("PORTUGUES", "TRAD")
        nome = nome.replace("PORTUG ", "TRAD ")
        nome = re.sub(r'\bCHO\b', 'CHOC', nome)
        nome = nome.replace("CLAS/DIPLOM", "DIPLOMATA")
        nome = nome.replace("DIAM/NEGRO", "DIAMANTE NEGRO")
        nome = nome.replace("A/LEITE", "AO LEITE")
        nome = nome.replace("M/AMARGO", "MEIO AMARGO")
        nome = nome.replace("CAM/JORDAO", "CAMPOS DO JORDAO")
        nome = nome.replace("CAMPOS JORDAO", "CAMPOS DO JORDAO")
        nome = re.sub(r'^MAION\b', 'MAIONESE', nome)
        nome = re.sub(r'\bMAION\s', 'MAIONESE ', nome)
        nome = nome.replace("D/BENTA", "D BENTA")
        nome = nome.replace("MID/FIT", "MID FIT")
        nome = nome.replace("MID/", "MID ")
        nome = re.sub(r'\bTTO\b', 'TINTO', nome)
        nome = re.sub(r'\bFEM\b', 'F', nome)
        nome = re.sub(r'\bMEN\b', 'M', nome)
        nome = nome.replace('/', ' ')
        nome = nome.replace("S ADICAO DE ACUCAR", "SEMACUCAR")
        nome = nome.replace("SEM ADICAO DE ACUCAR", "SEMACUCAR")
        nome = nome.replace("S ACUCAR", "SEMACUCAR")
        nome = nome.replace("SEM ACUCAR", "SEMACUCAR")
        nome = nome.replace("Q-BOA", "QBOA")
        nome = re.sub(r'\bQ\s+BOA\b', 'QBOA', nome)
        nome = nome.replace("SALON LINE", "SALONLINE")
        nome = nome.replace("GOMES COSTA", "GCOSTA")
        nome = nome.replace("GOMES DA COSTA", "GCOSTA")
        nome = nome.replace("PINHO SOL", "PINHOSOL")
        nome = nome.replace("PINHO BRIL", "PINHOBRIL")
        nome = nome.replace("PINHO TROP", "PINHOTROP")
        nome = nome.replace("GIRAN SOL", "GIRANDO SOL")
        nome = nome.replace("GIRASSOL AMAC", "GIRANDO SOL AMAC")
        nome = nome.replace("BABY SOFT", "BABYSOFT")
        nome = nome.replace("MON BIJU", "MONBIJU")
        nome = nome.replace("SO BRILHO", "SOBRILHO")
        nome = nome.replace("SUPER CANDIDA", "SUPERCANDIDA")
        nome = nome.replace("SEMPRE LIVRE", "S LIVRE")
        nome = nome.replace("CASA CLEAN", "CASACLEAN")
        nome = nome.replace("GOTA DOURADA", "GOTADOURADA")
        nome = nome.replace("TRA LA LA", "TRALALA")
        nome = nome.replace("OLD SPICE", "OLDSPICE")
        nome = nome.replace("GIOVANNA BABY", "GIOVANNABABY")
        nome = nome.replace("CASA & PERFUME", "CASA&PERF")
        nome = nome.replace("CASA&PERFUME", "CASA&PERF")
        nome = nome.replace("ROLL ON", "ROLLON")
        nome = nome.replace("ROLL-ON", "ROLLON")
        nome = nome.replace("CLUB SOCIAL", "CLUBSOCIAL")
        nome = nome.replace("RED BULL", "REDBULL")
        nome = nome.replace("JACK DANIELS", "JACKDANIELS")
        nome = nome.replace("JOHNNY WALKER", "JOHNNIEWALKER")
        nome = nome.replace("JOHNNIE WALKER", "JOHNNIEWALKER")
        nome = nome.replace("WHITE HORSE", "WHITEHORSE")
        nome = nome.replace("SANGUE DE BOI", "SANGUEDEBOI")
        nome = nome.replace("COUNTRY WINE", "COUNTRYWINE")
        nome = nome.replace("MARCUS JAMES", "MARCUSJAMES")
        nome = nome.replace("CONCHA Y TORO", "CONCHAYTORO")
        nome = nome.replace("CATCHUP", "KETCHUP")
        nome = nome.replace("MAT INSET", "MATINSET")
        # Sinônimos de embalagem: PT = POTE (abreviação comum na tabela de preços)
        nome = re.sub(r'(?<!\w)PT(?!\w)', 'POTE', nome)
        # Ortografia: CONFORT → COMFORT (tabela usa grafia inglesa da marca)
        nome = re.sub(r'\bCONFORT\b', 'COMFORT', nome)
        nome = nome.replace("TURMA DA MONICA", "TURMADAMONICA")
        nome = nome.replace("CLOSE UP", "CLOSEUP")
        nome = nome.replace("ORAL B", "ORALB")
        nome = nome.replace("ORAL-B", "ORALB")
        nome = nome.replace("PIT STOP", "PITSTOP")
        nome = nome.replace("SUPER BONDER", "SUPERBONDER")
        nome = nome.replace("DIABO VERDE", "DIABOVERDE")
        nome = nome.replace("TOTAL PLAST", "TOTALPLAST")
        nome = nome.replace("CASA&PERF", "CASAPERF")

        # 8a. v5.0: Sinônimos compostos adicionais
        nome = nome.replace("CAMPO LARGO", "CAMPOLARGO")
        nome = nome.replace("DOM BOSCO", "DOMBOSCO")
        nome = nome.replace("COUNTRY WINE", "COUNTRYWINE")
        nome = nome.replace("SALTON", "SALTON")
        nome = nome.replace("SUPER CANDIDA", "SUPERCANDIDA")
        nome = nome.replace("GILLETTE", "GILLETTE")
        nome = nome.replace("PRESTOBARBA", "PRESTOBARBA")
        nome = nome.replace("PRESTO BARBA", "PRESTOBARBA")
        nome = nome.replace("ULTRAGRIP", "ULTRAGRIP")
        nome = nome.replace("ULTRA GRIP", "ULTRAGRIP")
        nome = nome.replace("SINGER", "SINGER")
        nome = nome.replace("FACILITA", "FACILITA")
        nome = nome.replace("COPOMAIS", "COPOMAIS")
        nome = nome.replace("PEDIGREE", "PEDIGREE")
        nome = nome.replace("GRANADO", "GRANADO")
        nome = nome.replace("SIENE", "SIENE")
        nome = nome.replace("BEIRA ALTA", "BEIRAALTA")
        nome = nome.replace("SALG TORCIDA", "SALG TORCIDA")
        nome = nome.replace("EXTRATO TOMATE", "EXTR TOM")
        nome = nome.replace("EXT TOMATE", "EXTR TOM")
        nome = nome.replace("MOLHO TOMATE", "MOL TOM")
        nome = nome.replace("CREAM CRACKER", "C CRAKER")
        nome = nome.replace("C. CRAKER", "C CRAKER")
        nome = nome.replace("AGUA E SAL", "AGUA E SAL")
        nome = nome.replace("MARIA LEITE", "MARIA LEITE")
        nome = nome.replace("SANSUNG", "SAMSUNG")
        # Tratamento para "VDE" e "VIDRO" em azeitonas
        nome = nome.replace("VDE ", "VD ")
        nome = nome.replace("VIDRO ", "VD ")
        # Decodificar & de HTML
        nome = nome.replace("&", "E")
        # Grafia alternativa VITARELA (1 L) → VITARELLA (2 L)
        nome = re.sub(r'\bVITARELA\b', 'VITARELLA', nome)

        # 8b. Remove pontos soltos de abreviações (SAB. → SAB, PAP. → PAP, etc)
        nome = re.sub(r'\.(\s|$)', r'\1', nome)

        # 9. SINÔNIMOS GERAIS EXPANDIDOS (v3.0 + v4.7)
        sinonimos = {
            # Lava-roupa
            "SABAO EM PO": "LAVA ROUPA PO", "SABAO PO": "LAVA ROUPA PO",
            "DETERGENTE EM PO": "LAVA ROUPA PO", "DETERGENTE PO": "LAVA ROUPA PO",
            "DETERGENTE ROUPA PO": "LAVA ROUPA PO",
            "SABAO LIQUIDO": "LAVA ROUPA LIQ", "LAVA ROUPAS": "LAVA ROUPA",
            "LAVA ROUPA LIQUIDO": "LAVA ROUPA LIQ", "LAVA ROUPA LQ": "LAVA ROUPA LIQ", "LIQUIDO": "LIQ",
            # Produto
            "TRADICIONAL": "TRAD", "ORIGINAL": "ORIG", "MACARRAO": "MACAR",
            "SHAMPOO": "SH", "SHAMP": "SH", "CONDICIONADOR": "COND",
            "DETERGENTE": "DET", "DESINFETANTE": "DESINF",
            # Embalagem
            "CAIXA": "CX", "VIDRO": "VD", "SAQUINHO": "SACHE",
            "SACHET": "SACHE", "PACOTE": "PCT", "LATA": "LT",
            "BISNAGA": "BISNAGA", "GARRAFA": "GAR", "FRASCO": "FRASCO",
            # Higiene / Limpeza
            "AGUA SANITARIA": "SANITARIA", "AGUA DE COCO": "AGUA COCO",
            "PAPEL HIGIENICO": "PAPEL HIG", "PAPEL TOALHA": "PAPEL TOALHA",
            # Bebidas
            "COM GAS": "CGAS", "SEM GAS": "SGAS",
            # Bebidas - suco/refresco (PO = pó, price table não usa)
            "REFRESCO PO": "REFR", "REFRESCO": "REFR", "SUCO PO": "REFR",
            "CONCENTRADO": "CONC",
            # Bebidas - vinho
            "BEB VINHO": "VIN",
            # Biscoito
            "BOLACHA": "BISC", "BISCOITO": "BISC", "CREAM CRACKER": "CREAM CRACKER",
            "RECHEADO": "RECHEADO",
            "WAFER": "WAFER",
            # Desodorante
            "DESODORANTE ANTITRANSPIRANTE": "DESOD ANTITRANSP", "ANTITRANSPIRANTE": "ANTITRANSP",
            "DESODORANTE AEROSSOL": "DESOD AEROSSOL", "DESODORANTE AEROSOL": "DESOD AEROSSOL",
            "DESODORANTE ROLL ON": "DESOD ROLL ON", "DESODORANTE ROLL-ON": "DESOD ROLL ON",
            "DESODORANTE SPRAY": "DESOD SPRAY", "DESODORANTE STICK": "DESOD STICK",
            "DESODORANTE COLONIA": "DEO COLONIA", "DESODORANTE COLÔNIA": "DEO COLONIA",
            "DEO COLONIA": "DEO COLONIA", "DEO COLOGNE": "DEO COLONIA", "BODY SPLASH": "BODY SPLASH",
            # Azeite
            "AZEITE DE OLIVA": "AZEITE", "AZEITE OLIVA": "AZEITE",
            "AZEITE EXTRAVIRGEM": "AZEITE EXTRAVIGEM", "AZEITE EXTRA VIRGEM": "AZEITE EXTRAVIRGEM",
            # v5.0: Sinônimos adicionais
            "ACHOCOLATADO": "ACHOC", "ACHOCOLATADO PO": "ACHOC PO",
            "DESINFETANTE": "DESINF", "AMACIANTE": "AMAC",
            "DETERGENTE LIQUIDO": "DET LIQ", "DETERGENTE LIQ": "DET LIQ",
            "LV LOUCA": "DET",
            "SABONETE": "SAB", "SABONETE LIQUIDO": "SAB LIQ",
            "PAPEL HIGIENICO": "PAPEL HIG",
            "PAPEL TOALHA": "PAPEL TOALHA",
            "GUARDA NAPOLITANO": "GUARDANAPO",
            "AZEITONA VERDE": "AZEITONA VDE",
            "ACHOC PO": "ACHOC PO",
            "LEITE CONDENSADO": "LEITE COND", "LEITE CONDECADO": "LEITE COND",
            "LEITE EM PO": "LEITE PO",
            "COCO RALADO": "COCO RAL", "FLOCOS DE COCO": "COCO RAL FLOCOS",
            "CASA E PERFUME": "LIMP PERF CASA PERF", "CASA&PERFUME": "LIMP PERF CASA PERF",
            "CREME DENTAL": "CR D",
            "CREME DE LEITE": "CR LEITE",
            "CREME TRATAMENTO": "CR TRAT",
            "CREME PENTEAR": "CR PENTE",
            "ENXAGUE BUCAL": "ENX BUC",
            "ESCOVA DENTAL": "ESC DENT",
            "ESCOVA CABELO": "ESC CAB",
            "ESPONJA LOUCA": "ESP LOUCA",
            # Creme dental — variantes de grafia para a mesma linha
            "TOTAL 12": "TOTAL12",
            "NEUTRAZUCAR": "NEUTRACUCAR",
            "SENSITIVE": "SENSIVEL",
        }
        for k, v in sinonimos.items():
            nome = nome.replace(k, v)

        # 10. INTELIGÊNCIA DE MARCAS — expandida (v3.0)

        # Categorias que não devem receber injeção de categoria extra
        _nome_cat = nome.split()[0] if nome.split() else ''
        for marca, categoria in inteligencia_marcas.items():
            # Usar word boundary para evitar QUERO dentro de QUEROSENE, etc
            if not re.search(r'(?<![A-Za-z])' + re.escape(marca) + r'(?![A-Za-z])', nome):
                continue
            if categoria.split()[0] not in nome:
                # Não injetar se o nome já tem uma categoria válida diferente
                if _nome_cat in _CATS_FIXAS:
                    continue
                # Não injetar se a marca é multi-categoria e o contexto indica outra
                if marca in _MULTI_CATS:
                    if any(ctx in nome for ctx in _MULTI_CATS[marca]):
                        continue
                nome += f" {categoria}"

        return nome

def ordenar_palavras(nome):
        if not nome:
            return ""
        # Mantém apenas letras, números e pontos
        palavras = re.findall(r'[A-Z0-9.]+', str(nome))
        palavras.sort()
        return " " .join(palavras)

def _obter_prefixo_categoria(nome_normalizado):
        """
        Tenta achar a categoria (prefixo) com base no nome normalizado.
        Usa a logica v4.7 (busca por prefixo + mapa de marcas).
        """
        nome = nome_normalizado
        
        # 1. Checa prefixos fixos (BISC, CAFE, etc)
        prefixos_fixos = sorted(set(MARCAS_POR_CATEGORIA.keys()), key=len, reverse=True)
        for chave in prefixos_fixos:
            if nome.startswith(chave + ' ') or nome == chave:
                return chave
        
        # 2. Checa marcas conhecidas para inferir categoria
        for marca in sorted(inteligencia_marcas.keys(), key=len, reverse=True):
            if marca in nome:
                # Mapeamento: MARCA -> CATEGORIA
                # Ex: DOWNY -> AMACIANTE. Se "DOWNY" tá no nome, adiciona "AMACIANTE" se não tiver.
                categorias_possiveis = [v for k, v in MARCAS_POR_CATEGORIA.items() if k == marca]
                if categorias_possiveis:
                    cat = categorias_possiveis[0]
                    if cat.split()[0] not in nome:
                        return cat
        
        return ""

def _peso_para_numero(peso_str):
        """Converte string de peso (500G, 1.5KG, 350ML) para número em gramas/ml."""
        try:
            m = re.match(r'(\d+(?:\.\d+)?)(G|KG|ML|L|LT|M)', peso_str)
            if not m:
                return None
            val = float(m.group(1))
            unit = m.group(2)
            if unit == 'KG':
                return val * 1000
            if unit in ('L', 'LT', 'M'):
                return val * 1000  # litros → ml
            return val  # G ou ML
        except:
            return None

def _extrair_medidas(nome):
        """Extrai medidas explícitas, incluindo formatos de pack como 2X500G."""
        padrao = r'\b\d+(?:\.\d+)?(?:G|KG|ML|L|LT|M|UN)\b'
        medidas = set(re.findall(padrao, nome))
        medidas.update(re.findall(r'\b\d+\s*X\s*(\d+(?:\.\d+)?(?:G|KG|ML|L|LT|M|UN))\b', nome))
        return medidas

def _tem_azeite(nome):
        return nome.startswith('AZEITE') or ' AZEITE ' in f' {nome} '

def _subtipo_azeite(nome):
        if 'RESERVA' in nome.split():
            return 'RESERVA'
        if 'EXTRAVIRGEM' in nome.split():
            return 'EXTRAVIRGEM'
        if 'TIPO UNICO' in nome or 'TIPOUNICO' in nome or 'TRAD' in nome.split():
            return 'TIPO_UNICO'
        return ''

def _azeites_incompativeis(nome1, nome2):
        if not (_tem_azeite(nome1) and _tem_azeite(nome2)):
            return False
        subtipo1 = _subtipo_azeite(nome1)
        subtipo2 = _subtipo_azeite(nome2)
        return bool(subtipo1 and subtipo2 and subtipo1 != subtipo2)

def _tolerancia_medida(nome1, nome2):
        """Categorias vendidas por embalagem exata nao devem aceitar peso muito aproximado."""
        _is_vin = 'VIN ' in nome1 or nome1.startswith('VIN') or 'VIN ' in nome2 or nome2.startswith('VIN')
        if _is_vin:
            return 0.85
        _estritas = (
            'MAIONESE', 'MAION', 'ACHOC', 'AZEITE', 'OLEO', 'PAPEL ALUM',
            'TRIDENT', 'SH ', 'COND ', 'CR PENTE', 'SUSTAGEM', 'EXTR TOM',
        )
        if any(cat in nome1 or cat in nome2 for cat in _estritas):
            return 0.95
        return 0.7

def _extrair_dimensoes_papel_alum(nome):
        """Extrai medidas como 45X4, 30X7.5 ou 4MTX45CM para papel aluminio."""
        if 'PAPEL ALUM' not in nome:
            return set()
        dims = set()
        for a, b in re.findall(r'\b(\d+(?:\.\d+)?)\s*(?:CM|M)?\s*X\s*(\d+(?:\.\d+)?)\s*(?:CM|M)?\b', nome):
            vals = tuple(sorted((float(a), float(b))))
            dims.add(vals)
        return dims

def _coco_ralado_flocos_incompativeis(nome1, nome2):
        """Coco ralado tradicional nao deve casar com coco em flocos/Flococo."""
        if 'COCO' not in nome1 or 'COCO' not in nome2:
            return False
        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())
        flocos1 = bool(tokens1 & {'FLOCOS', 'FLOCOCO'})
        flocos2 = bool(tokens2 & {'FLOCOS', 'FLOCOCO'})
        return flocos1 != flocos2

def _coco_ralado_sem_acucar_incompativel(nome1, nome2):
        """Coco ralado sem acucar nao deve casar com versao comum."""
        if 'COCO RAL' not in nome1 and 'COCO RAL' not in nome2:
            return False
        sem_acucar1 = 'SEMACUCAR' in nome1.split()
        sem_acucar2 = 'SEMACUCAR' in nome2.split()
        return sem_acucar1 != sem_acucar2

def _extrato_tomate_incompativel(nome1, nome2):
        """Extrato de tomate exige mesma marca, embalagem e variedade."""
        if 'EXTR TOM' not in nome1 or 'EXTR TOM' not in nome2:
            return False

        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())

        marcas = MARCAS_POR_CATEGORIA.get('EXTR TOM', set())
        marcas1 = tokens1 & marcas
        marcas2 = tokens2 & marcas
        if marcas1 and marcas2 and not marcas1.intersection(marcas2):
            return True

        medidas1 = _extrair_medidas(nome1)
        medidas2 = _extrair_medidas(nome2)
        if medidas1 and medidas2 and not medidas1.intersection(medidas2):
            return True

        def _embalagem(tokens):
            if tokens & {'SACHE', 'SACHET', 'POUCH', 'SC'}:
                return 'SACHE'
            if tokens & {'POTE', 'PT'}:
                return 'POTE'
            return ''

        emb1 = _embalagem(tokens1)
        emb2 = _embalagem(tokens2)
        if emb1 != emb2:
            return True

        def _variedade(tokens):
            if 'CARNE' in tokens and 'PANELA' in tokens:
                return 'CARNE_PANELA'
            if ('CEB' in tokens or 'CEBOLA' in tokens) and 'ALHO' in tokens:
                return 'CEB_ALHO'
            if 'TRAD' in tokens or 'TRADICIONAL' in tokens:
                return 'TRAD'
            return 'TRAD'

        return _variedade(tokens1) != _variedade(tokens2)

def _ketchup_marca_incompativel(nome1, nome2):
        """Ketchup com marca conhecida nao deve casar com outra marca ou generico."""
        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())
        if 'KETCHUP' not in tokens1 or 'KETCHUP' not in tokens2:
            return False

        marcas = MARCAS_POR_CATEGORIA.get('KETCHUP', set())
        marcas1 = tokens1 & marcas
        marcas2 = tokens2 & marcas
        if marcas1 and marcas2:
            return not marcas1.intersection(marcas2)
        return bool(marcas1 or marcas2)

def _maionese_limao_incompativel(nome1, nome2):
        """Maionese sabor limao nao deve casar com versao sem limao."""
        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())
        maionese1 = bool(tokens1 & {'MAIONESE', 'MAION'})
        maionese2 = bool(tokens2 & {'MAIONESE', 'MAION'})
        if not (maionese1 and maionese2):
            return False
        return ('LIMAO' in tokens1) != ('LIMAO' in tokens2)

def _molho_marca_variedade_incompativel(nome1, nome2):
        """Molho de tomate exige mesma marca e mesma variedade principal."""
        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())
        molho1 = 'MOLHO' in tokens1 or 'MOL TOM' in nome1
        molho2 = 'MOLHO' in tokens2 or 'MOL TOM' in nome2
        if not (molho1 and molho2):
            return False

        marcas = MARCAS_POR_CATEGORIA.get('MOLHO', set()) | MARCAS_POR_CATEGORIA.get('MOL TOM', set())
        marcas1 = tokens1 & marcas
        marcas2 = tokens2 & marcas
        if marcas1 and marcas2 and not marcas1.intersection(marcas2):
            return True
        if bool(marcas1) != bool(marcas2):
            return True

        def _variedade(tokens):
            if 'BOLONHESA' in tokens or 'BOLONHES' in tokens:
                return 'BOLONHESA'
            if 'PIZZA' in tokens:
                return 'PIZZA'
            if 'MANJERICAO' in tokens:
                return 'MANJERICAO'
            if 'PARMEGIANA' in tokens or 'PARM' in tokens:
                return 'PARMEGIANA'
            if 'TRAD' in tokens or 'TRADICIONAL' in tokens:
                return 'TRAD'
            return 'TRAD'

        return _variedade(tokens1) != _variedade(tokens2)

def _atum_sardinha_variante_incompativel(nome1, nome2):
        """Atum/sardinha de sabores ou conservas diferentes nao compartilham preco."""
        tokens1 = set(nome1.split())
        tokens2 = set(nome2.split())
        peixe1 = bool(tokens1 & {'ATUM', 'SARD'})
        peixe2 = bool(tokens2 & {'ATUM', 'SARD'})
        if not (peixe1 and peixe2):
            return False

        marcas = MARCAS_POR_CATEGORIA.get('ATUM', set()) | MARCAS_POR_CATEGORIA.get('SARD', set())
        marcas1 = tokens1 & marcas
        marcas2 = tokens2 & marcas
        if marcas1 and marcas2 and not marcas1.intersection(marcas2):
            return True

        variantes = {'TOMATE', 'MOLHO', 'PICANTE', 'LIMAO', 'OLEO', 'DEFUMADO', 'NATURAL'}
        var1 = tokens1 & variantes
        var2 = tokens2 & variantes
        if var1 and var2 and not var1.intersection(var2):
            return True
        return bool(var1) != bool(var2)

def _conhecimento_produto_incompativel(nome1, nome2):
        """
        Trava conservadora baseada na base externa de conhecimento.

        So bloqueia quando os dois lados foram reconhecidos com boa confianca
        e existe conflito explicito de categoria, marca, sabor, fragrancia ou
        linha. Se a base nao carregar, nao altera o comportamento antigo.
        """
        if _recognize_product is None:
            return False
        try:
            p1 = _recognize_product(nome1)
            p2 = _recognize_product(nome2)
        except Exception:
            return False

        if p1.get("confianca", 0) < 0.7 or p2.get("confianca", 0) < 0.7:
            return False

        cat1 = p1.get("categoria")
        cat2 = p2.get("categoria")
        if cat1 and cat2 and cat1 != cat2 and p1.get("confianca", 0) >= 0.85 and p2.get("confianca", 0) >= 0.85:
            return True

        if not (cat1 and cat2 and cat1 == cat2):
            return False

        marca1 = p1.get("marca")
        marca2 = p2.get("marca")
        if marca1 and marca2 and marca1 != marca2:
            return True

        for campo in ("sabor", "fragrancia", "linha"):
            valor1 = p1.get(campo)
            valor2 = p2.get(campo)
            if valor1 and valor2 and valor1 != valor2:
                return True

        return False

def _sabores_caldo_incompativeis(nome1, nome2):
        """Caldo de sabores diferentes nao deve compartilhar preco."""
        tokens1 = set(re.findall(r'[A-Z]{3,}', nome1))
        tokens2 = set(re.findall(r'[A-Z]{3,}', nome2))

        caldo1 = 'CALDO' in tokens1 or bool(tokens1 & {'KNORR', 'MAGGI'} and tokens1 & SABORES_CALDO)
        caldo2 = 'CALDO' in tokens2 or bool(tokens2 & {'KNORR', 'MAGGI'} and tokens2 & SABORES_CALDO)
        if not (caldo1 and caldo2):
            return False

        sabores1 = tokens1 & SABORES_CALDO
        sabores2 = tokens2 & SABORES_CALDO
        return bool(sabores1 and sabores2 and sabores1 != sabores2)

def _snack_sabor_incompativel(nome1, nome2):
        """Batata/salgadinho exige mesmo sabor/linha quando sabor aparece."""
        cats1 = _categorias_seguras(nome1)
        cats2 = _categorias_seguras(nome2)
        if not (cats1 & cats2 & {'BATATA', 'SALG'}):
            return False

        sabores_snack = {
            'ORIG', 'ORIGINAL', 'TRAD', 'TRADICIONAL', 'QUEIJO', 'CHEDDAR',
            'REQUEIJAO', 'CHURRASCO', 'CEBOLA', 'SALSA', 'BACON', 'PAPRICA',
            'PIMENTA', 'PICANTE', 'CREME', 'CREM', 'NACHO', 'PRESUNTO',
            'BARBECUE', 'BBQ', 'RANCH', 'CREAMCHEESE',
        }
        tokens1 = set(re.findall(r'[A-Z]{3,}', nome1))
        tokens2 = set(re.findall(r'[A-Z]{3,}', nome2))
        sabor1 = tokens1 & sabores_snack
        sabor2 = tokens2 & sabores_snack
        return bool(sabor1 and sabor2 and not sabor1.intersection(sabor2))

def _tem_sinal_categoria(nome, sinal):
        if sinal.endswith(' '):
            return nome.startswith(sinal) or f' {sinal}' in f' {nome} '
        if ' ' in sinal:
            return sinal in nome
        return bool(re.search(r'(?:^|(?<=[^A-Z0-9]))' + re.escape(sinal) + r'(?=[^A-Z0-9]|$)', nome))

def _categorias_seguras(nome):
        cats = set()
        for categoria, sinais in _CATEGORIAS_FORTES:
            if any(_tem_sinal_categoria(nome, sinal) for sinal in sinais):
                cats.add(categoria)

        for categoria in MARCAS_POR_CATEGORIA:
            cat = _CAT_EQUIV_SEGURA.get(categoria, categoria)
            if nome.startswith(categoria + ' ') or f' {categoria} ' in f' {nome} ' or nome == categoria:
                cats.add(cat)

        if 'AGUA SANITARIA' in cats:
            cats.discard('AGUA')
        if 'LIMPA VIDRO' in cats:
            cats.discard('LIMPADOR')
        if 'CREME DENTAL' in cats:
            cats.discard('CREME')
        return cats

def _marcas_para_categorias(categorias):
        mapa = {
            'AGUA SANITARIA': ('SANITARIA',),
            'DETERGENTE LOUCA': ('DET', 'LV LOUCA'),
            'DESINF': ('DESINF',),
            'LIMPADOR': ('LIMP',),
            'LIMPA VIDRO': ('LIMP',),
            'LUSTRA MOVEL': ('LUSTRA',),
            'AMAC': ('AMAC',),
            'LAVA ROUPA': ('LAVA ROUPA',),
            'FRAL': ('FRAL', 'FRALDA'),
            'INSET': ('INSET',),
            'APAR': ('APAR',),
            'ALCOOL': ('ALCOOL',),
            'SH': ('SH',),
            'COND': ('COND',),
            'CR TRAT': ('CR TRAT',),
            'SAB': ('SAB',),
            'DESOD': ('DESOD', 'DES'),
            'SALG': ('SALG', 'BATATA'),
            'BATATA': ('BATATA', 'SALG'),
            'CREME DENTAL': ('CR D', 'CR DENTAL'),
            'VINHO': ('VIN', 'VINHO'),
        }
        marcas = set()
        for categoria in categorias:
            for chave in mapa.get(categoria, (categoria,)):
                marcas.update(MARCAS_POR_CATEGORIA.get(chave, set()))
        marcas.update({'CANDURA', 'ALPES', 'BARBAREX', 'HARPIC', 'UFENOL'})
        return marcas

def _marcas_no_nome(nome, marcas):
        encontradas = set()
        for marca in sorted(marcas, key=len, reverse=True):
            padrao = r'(?:^|(?<=\s))' + re.escape(marca) + r'(?=\s|$)'
            if re.search(padrao, nome):
                encontradas.add(marca)
        return encontradas

def _fragrancias_no_nome(nome):
        achadas = set()
        for canonica, aliases in _FRAGRANCIAS_LIMPEZA.items():
            for alias in aliases:
                if _tem_sinal_categoria(nome, alias):
                    achadas.add(canonica)
                    break
        return achadas

def _contagens_embalagem(nome):
        contagens = set()
        for valor in re.findall(r'\bC(\d+)\b', nome):
            contagens.add(('C', valor))
        for valor in re.findall(r'\b(\d+)\s*NOIT(?:E|ES)?\b', nome):
            contagens.add(('NOITE', valor))
        for valor in re.findall(r'\b(\d+)\s*PAST(?:ILHA|ILHAS)?\b', nome):
            contagens.add(('PASTILHA', valor))
        for valor in re.findall(r'\bLV\s*(\d+)\b', nome):
            contagens.add(('LEVE', valor))
        for valor in re.findall(r'\bPG\s*(\d+)\b', nome):
            contagens.add(('PAGUE', valor))
        return contagens

def _travas_seguras_nome(nome1, nome2):
        """
        Travas conservadoras para impedir preco de produto parecido mas diferente.
        Usada tambem no matching relaxado para nao deixar a camada 2 contornar
        categoria, marca, fragrancia ou embalagem.
        """
        cats1 = _categorias_seguras(nome1)
        cats2 = _categorias_seguras(nome2)

        if cats1 and cats2 and not cats1.intersection(cats2):
            return True

        cats_comuns = cats1.intersection(cats2)
        if cats_comuns:
            marcas = _marcas_para_categorias(cats_comuns)
            marcas1 = _marcas_no_nome(nome1, marcas)
            marcas2 = _marcas_no_nome(nome2, marcas)
            if marcas1 and marcas2 and not marcas1.intersection(marcas2):
                return True
            cats_marca_obrigatoria = {
                'AGUA SANITARIA', 'AMAC', 'DESINF', 'DETERGENTE LOUCA',
                'LAVA ROUPA', 'LIMPADOR', 'LIMPA VIDRO', 'LUSTRA MOVEL',
                'FRAL', 'INSET', 'APAR', 'ALCOOL', 'SH', 'COND', 'CR TRAT',
                'SAB', 'DESOD', 'CREME DENTAL', 'SALG', 'BATATA',
            }
            if cats_comuns & cats_marca_obrigatoria and bool(marcas1) != bool(marcas2):
                return True

        if _snack_sabor_incompativel(nome1, nome2):
            return True

        cats_variantes = {
            'AGUA SANITARIA', 'ALCOOL', 'AMAC', 'DESINF', 'DETERGENTE LOUCA',
            'LAVA ROUPA', 'LIMPADOR', 'LIMPA VIDRO', 'LUSTRA MOVEL', 'SAPONACEO',
        }
        if cats1 & cats2 & cats_variantes:
            frag1 = _fragrancias_no_nome(nome1)
            frag2 = _fragrancias_no_nome(nome2)
            if bool(frag1) != bool(frag2):
                return True
            if frag1 and frag2 and frag1 != frag2:
                return True

        if cats1 & cats2 & {'FRAL', 'INSET', 'APAR'}:
            embal1 = _contagens_embalagem(nome1)
            embal2 = _contagens_embalagem(nome2)
            if embal1 and embal2 and not embal1.intersection(embal2):
                return True

        return False

def nomes_incompativeis_v4(nome1, nome2):
        """
        Lógica v4.8 — travas de categoria, marca, peso, subtipo e variante.
        Retorna True se deve BLOQUEAR a comparação.
        """
        if _travas_seguras_nome(nome1, nome2):
            return True

        # 0. TRAVA DE CATEGORIA CRUZADA (v4.8)
        # Se os nomes pertencem a categorias DIFERENTES → bloqueia
        # Ex: "MARG VIGOR" vs "MAIONESE VIGOR" → MARG ≠ MAIONESE → BLOQUEADO
        # Categorias equivalentes: DET↔LV LOUCA, DESINF↔DESINFETANTE, etc.
        _CAT_EQUIV = {
            'DET': 'LV LOUCA', 'DETERGENTE': 'LV LOUCA',
            'DESINFETANTE': 'DESINF', 'SABAO': 'SAB',
            'BISCOITO': 'BISC', 'AGUARDENTE': 'AGUARD',
            'CACHACA': 'CACHAC', 'SHAMPOO': 'SH',
            'CONDICIONADOR': 'COND', 'REPELENTE': 'REPEL',
            'MACAR': 'MAC', 'MAIONESE': 'MAION',
            'POLPA TOM': 'MOL TOM', 'POLPA': 'MOL TOM',
            'FRALDA': 'FRAL', 'PAPEL HIGIENICO': 'PAPEL HIG',
            'CATCHUP': 'KETCHUP', 'T MANCHA': 'ALV',
            'SABAO BARRA': 'SABAO', 'SABAO PASTA': 'SABAO',
        }
        _cats1 = set()
        _cats2 = set()
        for c in MARCAS_POR_CATEGORIA:
            if nome1.startswith(c + ' ') or c + ' ' in nome1 or nome1 == c:
                _cats1.add(_CAT_EQUIV.get(c, c))
            if nome2.startswith(c + ' ') or c + ' ' in nome2 or nome2 == c:
                _cats2.add(_CAT_EQUIV.get(c, c))
        if _cats1 and _cats2 and not _cats1.intersection(_cats2):
            return True

        if _azeites_incompativeis(nome1, nome2):
            return True

        d1 = _extrair_dimensoes_papel_alum(nome1)
        d2 = _extrair_dimensoes_papel_alum(nome2)
        if d1 and d2 and not d1.intersection(d2):
            return True

        # 1. TRAVA DE PESO (v5.0) — Relaxada para aceitar pesos próximos
        c1 = _extrair_medidas(nome1)
        c2 = _extrair_medidas(nome2)
        if c1 and c2 and not c1.intersection(c2):
            _tol_peso = _tolerancia_medida(nome1, nome2)
            pesos_proximos = False
            for p1 in c1:
                v1 = _peso_para_numero(p1)
                for p2 in c2:
                    v2 = _peso_para_numero(p2)
                    if v1 and v2 and v1 > 0 and v2 > 0:
                        ratio = min(v1, v2) / max(v1, v2)
                        if ratio >= _tol_peso:
                            pesos_proximos = True
                            break
                if pesos_proximos:
                    break
            if not pesos_proximos:
                if not ('LA ACO' in nome1 and 'LA ACO' in nome2):
                    return True

        # 1c. TRAVA DE PESO IMPLÍCITO — número sem unidade vs peso explícito
        # Ex: "LAVA ROUPA PO OMO 400" (sem G) vs "LAVA ROUPA PO OMO 1.6KG" → bloqueia se diff > 30%
        def _numeros_bare(nome):
            """Retorna números 50-2000 sem unidade adjacente — prováveis pesos em gramas."""
            return [int(m) for m in re.findall(r'(?<!\d)(\d{2,4})(?!\d|G|KG|ML|L)', nome)
                    if 50 <= int(m) <= 2000]
        if not c1 and c2:
            for bv in _numeros_bare(nome1):
                for p2 in c2:
                    v2 = _peso_para_numero(p2)
                    if v2 and v2 > 0 and min(bv, v2) / max(bv, v2) < 0.7:
                        return True
        elif c1 and not c2:
            for bv in _numeros_bare(nome2):
                for p1 in c1:
                    v1 = _peso_para_numero(p1)
                    if v1 and v1 > 0 and min(bv, v1) / max(bv, v1) < 0.7:
                        return True

        # 1b. TRAVA DE PACK SIZE (C4 ≠ C8 ≠ C12, L12 ≠ L16) — SEMPRE bloqueia
        # Pack sizes: C seguido de número (C/4 → C4) ou L seguido de número (L12 = 12 rolos)
        pack1 = set(re.findall(r'(?:C|L)(\d+)', nome1))
        pack2 = set(re.findall(r'(?:C|L)(\d+)', nome2))
        if pack1 and pack2 and not pack1.intersection(pack2):
            return True

        # 2. TRAVA DE MARCA (v4.7 - CORRIGIDO)
        # Busca marcas DENTRO dos sets de MARCAS_POR_CATEGORIA
        # Se ambos nomes pertencem à mesma categoria mas têm marcas diferentes -> BLOQUEIO
        for categoria, marcas_set in MARCAS_POR_CATEGORIA.items():
            # Checar se a categoria se aplica (prefixo no nome ou marca presente)
            cat_aplica_1 = nome1.startswith(categoria + ' ') or categoria + ' ' in nome1
            cat_aplica_2 = nome2.startswith(categoria + ' ') or categoria + ' ' in nome2
            
            if not (cat_aplica_1 or cat_aplica_2):
                continue
            
            # Achar marcas nos nomes usando word boundary (palavra inteira)
            # Evita pegar FORT dentro de EXTRAFORTE, BALA dentro de BALALAIKA, etc
            marcas1 = set()
            marcas2 = set()
            for marca in sorted(marcas_set, key=len, reverse=True):
                # Usar regex word boundary para match de palavra inteira
                padrao_marca = r'(?:^|(?<=\s))' + re.escape(marca) + r'(?=\s|$)'
                if re.search(padrao_marca, nome1):
                    marcas1.add(marca)
                if re.search(padrao_marca, nome2):
                    marcas2.add(marca)
            
            # Se achou marca em ambos e são diferentes -> BLOQUEIO
            if marcas1 and marcas2 and not marcas1.intersection(marcas2):
                return True

        # 3. TRAVA DE SUBTIPO (v4.7)
        # Usa word boundary para tokens curtos (evita 'PO' casar com 'COMPOTA')
        def _match_sub(s, nome):
            if ' ' in s:
                return s in nome
            return bool(re.search(r'(?<![A-Z0-9])' + re.escape(s) + r'(?![A-Z0-9])', nome))

        for grupo in SUBTIPOS_EXCLUSIVOS:
            sub1 = next((s for s in grupo if _match_sub(s, nome1)), None)
            sub2 = next((s for s in grupo if _match_sub(s, nome2)), None)
            if sub1 and sub2 and sub1 != sub2:
                return True

        # 4. TRAVA DE FRAGRÂNCIAS / VARIANTE (Solicitação específica do usuário)
        # Se tem tokens de sabor (COCO, LARANJA) em ambos e são diferentes -> BLOQUEIO
        # Usa TOKENS_VARIANTES_COMUNS para identificar sabores/frutas

        # Separa nome em tokens de pelo menos 3 letras
        tokens1 = set(re.findall(r'[A-Z]{3,}', nome1))
        tokens2 = set(re.findall(r'[A-Z]{3,}', nome2))

        # Remove tokens genéricos e marcas — filtra apenas sabores/variantes relevantes
        marcas_conhecidas = set(MARCAS_POR_CATEGORIA.keys())
        tokens1_var = (tokens1 - TOKENS_VARIANTE_DESCARTAR - marcas_conhecidas) & TOKENS_VARIANTE_COMUNS
        tokens2_var = (tokens2 - TOKENS_VARIANTE_DESCARTAR - marcas_conhecidas) & TOKENS_VARIANTE_COMUNS

        # BLOQUEIA quando AMBOS têm sabores/variantes E são DIFERENTES
        # Ex: produto1=COCO, produto2=LARANJA -> bloqueia
        # Ex: produto1=COCO, produto2=sem sabor -> passa (pode ser o mesmo sem especificar)
        if tokens1_var and tokens2_var and not tokens1_var.intersection(tokens2_var):
            return True

        # 4b. TRAVA DE SABOR PARA BEBIDAS/SUCOS (v4.9)
        # Se um nome tem sabor de fruta e o outro tem sabor DIFERENTE -> bloqueia
        # Isso previne "SUCO CONC MAGUARY UVA" de casar com "SUCO CONC MAGUARY MARACUJA"
        _SABORES_FRUTA = {
            'ABACAXI', 'ACEROLA', 'AMORA', 'BANANA', 'CAJU', 'CARAMBOLA',
            'CEREJA', 'COCO', 'FRAMBOESA', 'GOIABA', 'GRAPE', 'GUARANA',
            'JABUTICABA', 'LARANJA', 'LIMAO', 'MACA', 'MAMAO', 'MANGA',
            'MARACUJA', 'MELANCIA', 'MORANGO', 'PESSEGO', 'TANGERINA',
            'TAMARINDO', 'UVA', 'UVAIA',
        }
        sabores1 = tokens1 & _SABORES_FRUTA
        sabores2 = tokens2 & _SABORES_FRUTA
        if sabores1 and sabores2 and not sabores1.intersection(sabores2):
            return True

        # 4c. TRAVA DE SABOR GERAL (inclui chocolate, baunilha, etc.)
        _SABORES_GERAIS = {
            'ABACAXI', 'ACEROLA', 'AMORA', 'BANANA', 'BAUNILHA', 'BERRY',
            'CAJU', 'CARAMBOLO', 'CEREJA', 'CHOC', 'CHOCOLATE', 'COCO',
            'CREME', 'CREM',
            'FRAMBOESA', 'GOIABA', 'GRAPE', 'GUARANA', 'LARANJA', 'LIMAO',
            'MACA', 'MAMAO', 'MANGA', 'MARACUJA', 'MELANCIA', 'MENTA',
            'MORANGO', 'PESSEGO', 'TANGERINA', 'TAMARINDO', 'UVA', 'UVAIA',
        }
        sab1 = tokens1 & _SABORES_GERAIS
        sab2 = tokens2 & _SABORES_GERAIS
        if sab1 and sab2 and not sab1.intersection(sab2):
            return True

        # 5. TRAVA ESPECÍFICA: Extravirgem vs Azeite Comum
        if 'EXTRAVIRGEM' in nome1 and 'EXTRAVIRGEM' not in nome2 and 'AZEITE' in nome2:
            return True
        if 'EXTRAVIRGEM' in nome2 and 'EXTRAVIRGEM' not in nome1 and 'AZEITE' in nome1:
            return True

        # 5b. TRAVA ESPECÍFICA: Suave vs não-Suave em AZEITE
        if 'SUAVE' in nome1 and 'SUAVE' not in nome2 and 'AZEITE' in nome2:
            return True
        if 'SUAVE' in nome2 and 'SUAVE' not in nome1 and 'AZEITE' in nome1:
            return True

        # 5c. TRAVA ESPECÍFICA: DIA A DIA vs comum em AZEITE
        if 'DIA A DIA' in nome1 and 'DIA A DIA' not in nome2 and 'AZEITE' in nome2:
            return True
        if 'DIA A DIA' in nome2 and 'DIA A DIA' not in nome1 and 'AZEITE' in nome1:
            return True

        # 5d. TRAVA: SEMI/DESNATADO/Z LAC vs implícito INTEGRAL em leite/leite condensado
        _leite_cats = ('LEITE COND', 'LEITE UHT', 'LEITE PO', 'LEITE')
        if any(c in nome1 or c in nome2 for c in _leite_cats):
            _tipos_especiais = ('SEMI', 'SEMIDESNATADO', 'DESNATADO', 'Z LAC', 'ZERO LACTOSE', '0% LACTOSE')
            esp1 = any(t in nome1 for t in _tipos_especiais)
            esp2 = any(t in nome2 for t in _tipos_especiais)
            int1 = 'INTEGRAL' in nome1
            int2 = 'INTEGRAL' in nome2
            # Se um tem tipo especial (SEMI/Z LAC) e o outro não tem tipo nenhum → bloqueia
            if esp1 and not esp2 and not int2:
                return True
            if esp2 and not esp1 and not int1:
                return True

        # 5e. TRAVA: LIGHT vs TRAD/normal em maionese/molho
        if ('LIGHT' in nome1 and 'LIGHT' not in nome2 and
            any(c in nome2 for c in ['MAIONESE', 'MAION', 'MOLHO'])):
            return True
        if ('LIGHT' in nome2 and 'LIGHT' not in nome1 and
            any(c in nome1 for c in ['MAIONESE', 'MAION', 'MOLHO'])):
            return True

        # 5f. TRAVA: SACHET vs não-SACHET (relaxada v5.0)
        # SC = saquinho/sachê na cotação, mas pode ser LT (lata) na tabela mestre
        # Só bloqueia se TEM SACHE explícito vs TEM POTE/COPO/BALDE explícito
        _sache_types = {'SACHE', 'SACHET', 'SACHÊ'}
        _pote_types = {'POTE', 'COPO', 'BALDE', 'BISNAGA'}  # PT já normalizado para POTE
        has_sache1 = any(t in nome1.split() for t in _sache_types)
        has_sache2 = any(t in nome2.split() for t in _sache_types)
        has_pote1 = any(t in nome1.split() for t in _pote_types)
        has_pote2 = any(t in nome2.split() for t in _pote_types)
        if (has_sache1 and has_pote2) or (has_pote1 and has_sache2):
            return True

        # 5f2. TRAVA: LT (lata) vs SC (sachê/saco) em produtos alimentares
        # MILHO e ERVILHA existem nas versões lata (LT) e sachê/saco (SC) com preços distintos
        _CATS_LT_SC = ('MILHO', 'ERVILHA', 'ATUM', 'SARD')
        if any(c in nome1 or c in nome2 for c in _CATS_LT_SC):
            _lt1 = bool(re.search(r'(?<![A-Z0-9])LT(?![A-Z0-9])', nome1))
            _lt2 = bool(re.search(r'(?<![A-Z0-9])LT(?![A-Z0-9])', nome2))
            _sc1 = bool(re.search(r'(?<![A-Z0-9])SC(?![A-Z0-9])', nome1))
            _sc2 = bool(re.search(r'(?<![A-Z0-9])SC(?![A-Z0-9])', nome2))
            if (_lt1 and _sc2) or (_sc1 and _lt2):
                return True

        # 5g. TRAVA: TP (tetrapack) vs VD (vidro) em sucos/bebidas
        _bebida_cats = ('SUCO', 'REFR', 'AGUA', 'LEITE')
        if any(c in nome1 or c in nome2 for c in _bebida_cats):
            tp1 = ' TP ' in nome1 or nome1.endswith(' TP')
            tp2 = ' TP ' in nome2 or nome2.endswith(' TP')
            vd1 = ' VD ' in nome1 or nome1.endswith(' VD')
            vd2 = ' VD ' in nome2 or nome2.endswith(' VD')
            if (tp1 and vd2) or (vd1 and tp2):
                return True

        # 5h. TRAVA: ALCOOL GEL vs ALCOOL líquido
        if 'ALCOOL' in nome1 and 'ALCOOL' in nome2:
            gel1 = 'GEL' in nome1.split()
            gel2 = 'GEL' in nome2.split()
            if gel1 != gel2:
                return True
            liq1 = any(t in nome1.split() for t in {'LIQ', 'LIQUIDO'})
            liq2 = any(t in nome2.split() for t in {'LIQ', 'LIQUIDO'})
            if (liq1 and not liq2 and gel2) or (liq2 and not liq1 and gel1):
                return True
            # 5i. TRAVA: grau de álcool diferente (70 vs 80 vs 46)
            _deg = lambda n: set(re.findall(r'(?<!\d)(46(?:\.2)?|70|80|92|96)(?!\d)', n))
            deg1 = _deg(nome1)
            deg2 = _deg(nome2)
            if deg1 and deg2 and not deg1.intersection(deg2):
                return True

        # 5j. TRAVA: gênero desodorante (F vs M)
        _des_prefixes = ('DES ', 'DESOD ', 'DESODORANTE ')
        if any(nome1.startswith(p) or p in nome1 for p in _des_prefixes):
            if any(nome2.startswith(p) or p in nome2 for p in _des_prefixes):
                # Extrair gênero: " F " ou " M " após volume/tipo
                _has_f = lambda n: bool(re.search(r'\bF\b', n))
                _has_m = lambda n: bool(re.search(r'\bM\b', n))
                f1, m1 = _has_f(nome1), _has_m(nome1)
                f2, m2 = _has_f(nome2), _has_m(nome2)
                # Bloqueia se um é feminino (F) e outro masculino (M)
                if (f1 and m2) or (m1 and f2):
                    return True

        # 6. TRAVA PO vs LIQUIDO (v4.7)
        tem_po_n1  = 'PO' in nome1.split() or 'LAVA ROUPA PO' in nome1
        tem_po_n2  = 'PO' in nome2.split() or 'LAVA ROUPA PO' in nome2
        tem_liq_n1 = bool({'LIQ', 'LQ'} & set(nome1.split())) or 'LAVA ROUPA LIQ' in nome1 or 'LAVA ROUPA LQ' in nome1
        tem_liq_n2 = bool({'LIQ', 'LQ'} & set(nome2.split())) or 'LAVA ROUPA LIQ' in nome2 or 'LAVA ROUPA LQ' in nome2
        if (tem_po_n1 and tem_liq_n2) or (tem_liq_n1 and tem_po_n2):
            return True

        # 7. TRAVA DE TAMANHO DE FRALDA (P, M, G, XG, XXG)
        if 'FRALDA' in nome1 or 'FRALDA' in nome2 or 'FRAL' in nome1 or 'FRAL' in nome2:
            tam1 = set(t for t in TAMANHOS_FRALDA if re.search(r'(?:^|\s)' + t + r'(?:\s|$)', nome1))
            tam2 = set(t for t in TAMANHOS_FRALDA if re.search(r'(?:^|\s)' + t + r'(?:\s|$)', nome2))
            if tam1 and tam2 and not tam1.intersection(tam2):
                return True

        # 8. TRAVA ERVILHA/MILHO MISTO: produto combinado ≠ produto puro
        # "ERVILHA/MILHO QUERO" não deve casar com "MILHO VERDE QUERO" (dois produtos distintos)
        if 'MILHO' in nome1 and 'ERVILHA' in nome1 and 'MILHO' in nome2 and 'ERVILHA' not in nome2:
            return True
        if 'MILHO' in nome2 and 'ERVILHA' in nome2 and 'MILHO' in nome1 and 'ERVILHA' not in nome1:
            return True

        # 9. TRAVA COCO FLOCOS vs COCO RALADO/TRAD
        # Flocos (lascas) são produto diferente de ralado tradicional
        if _coco_ralado_flocos_incompativeis(nome1, nome2):
            return True

        if _coco_ralado_sem_acucar_incompativel(nome1, nome2):
            return True

        if _extrato_tomate_incompativel(nome1, nome2):
            return True

        if _ketchup_marca_incompativel(nome1, nome2):
            return True

        if _maionese_limao_incompativel(nome1, nome2):
            return True

        if _molho_marca_variedade_incompativel(nome1, nome2):
            return True

        if _atum_sardinha_variante_incompativel(nome1, nome2):
            return True

        if _conhecimento_produto_incompativel(nome1, nome2):
            return True

        # 9b. TRAVA DE SABOR DE CALDO
        if _sabores_caldo_incompativeis(nome1, nome2):
            return True

        # 10. TRAVA ALCOOL COM FRAGRÂNCIA — fragrância ≠ sem fragrância (CLASSICO/TRAD)
        if 'ALCOOL' in nome1 and 'ALCOOL' in nome2:
            _FRAG_ALCOOL = {'EUCALIPTO', 'LAVANDA', 'MIMO', 'CITRONELA', 'CRAVO',
                            'BAUNILHA', 'CANELA', 'ERVA DOCE', 'FLORAL', 'CITRICO'}
            frag1 = any(f in nome1 for f in _FRAG_ALCOOL)
            frag2 = any(f in nome2 for f in _FRAG_ALCOOL)
            if frag1 != frag2:
                return True
            if frag1 and frag2:
                frags1 = {f for f in _FRAG_ALCOOL if f in nome1}
                frags2 = {f for f in _FRAG_ALCOOL if f in nome2}
                if not frags1.intersection(frags2):
                    return True

        # 11. TRAVA AMIDO MILHO — amido de milho ≠ milho verde
        if 'AMIDO' in nome1.split() and 'AMIDO' not in nome2.split():
            return True
        if 'AMIDO' in nome2.split() and 'AMIDO' not in nome1.split():
            return True

        if ('QUEROSENE' in nome1 and 'DESINF' in nome2) or ('QUEROSENE' in nome2 and 'DESINF' in nome1):
            return True

        # 12. TRAVA VINHO: branco, tinto e rose nao podem cruzar.
        if ('VIN ' in nome1 or nome1.startswith('VIN')) and ('VIN ' in nome2 or nome2.startswith('VIN')):
            _cores = {'TINTO', 'BRANCO', 'ROSE'}
            cor1 = set(nome1.split()) & _cores
            cor2 = set(nome2.split()) & _cores
            if cor1 and cor2 and not cor1.intersection(cor2):
                return True

        # 13. TRAVA SH/COND kit: item unitario nao deve pegar kit shampoo+condicionador.
        if any(cat in nome1 or cat in nome2 for cat in ('SH ', 'COND ')):
            kit1 = '+COND' in nome1 or 'SH COND' in nome1
            kit2 = '+COND' in nome2 or 'SH COND' in nome2
            if kit1 != kit2:
                return True

        # 14. TRAVA TRIDENT pote/display: embalagem de pote 54G nao e display 21x5.
        if 'TRIDENT' in nome1 and 'TRIDENT' in nome2:
            pote1 = 'POTE' in nome1.split()
            pote2 = 'POTE' in nome2.split()
            if pote1 != pote2:
                return True

        # 15. TRAVA aparelho de barbear: linhas BIC femininas/sensiveis nao cruzam.
        if ('APAR' in nome1 or 'BARB' in nome1) and ('APAR' in nome2 or 'BARB' in nome2):
            _linhas = {'SOLEIL', 'SENSIVEL', 'SENSITIVE', 'INTENSITY', 'COMFORT', 'VENUS'}
            l1 = set(nome1.split()) & _linhas
            l2 = set(nome2.split()) & _linhas
            if l1 and l2 and not l1.intersection(l2):
                return True

        return False

def _extrair_categoria(nome_normalizado):
        """Extrai a categoria principal do nome normalizado."""
        if not nome_normalizado:
            return ""
        primeira = nome_normalizado.split()[0] if nome_normalizado.split() else ""
        if primeira in MARCAS_POR_CATEGORIA:
            return primeira
        return primeira

def _extrair_marca(nome_normalizado):
        """Extrai a marca principal do nome normalizado (inclui marcas compostas)."""
        if not nome_normalizado:
            return ""
        todas_marcas = set()
        for marcas in MARCAS_POR_CATEGORIA.values():
            todas_marcas.update(marcas)
        # Check longest brands first (multi-word before single-word)
        for marca in sorted(todas_marcas, key=len, reverse=True):
            padrao = r'(?:^|(?<=\s))' + re.escape(marca) + r'(?=\s|$)'
            if re.search(padrao, nome_normalizado):
                return marca
        return ""

def _travas_leves(nome1, nome2):
        """
        Travas leves v5.1 — bloqueia categorias cruzadas, marcas
        diferentes, pack sizes, e cross-category same-brand.
        """
        if _travas_seguras_nome(nome1, nome2):
            return True

        # 1. TRAVA DE CATEGORIA CRUZADA
        _CAT_EQUIV = {
            'DET': 'LV LOUCA', 'DETERGENTE': 'LV LOUCA',
            'DESINFETANTE': 'DESINF', 'SABAO': 'SAB',
            'BISCOITO': 'BISC', 'AGUARDENTE': 'AGUARD',
            'CACHACA': 'CACHAC', 'SHAMPOO': 'SH',
            'CONDICIONADOR': 'COND', 'REPELENTE': 'REPEL',
            'MACAR': 'MAC', 'MAIONESE': 'MAION',
            'POLPA TOM': 'MOL TOM', 'POLPA': 'MOL TOM',
            'FRALDA': 'FRAL', 'PAPEL HIGIENICO': 'PAPEL HIG',
            'CATCHUP': 'KETCHUP', 'T MANCHA': 'ALV',
            'SABAO BARRA': 'SABAO', 'SABAO PASTA': 'SABAO',
        }
        _cats1 = set()
        _cats2 = set()
        for c in MARCAS_POR_CATEGORIA:
            if nome1.startswith(c + ' ') or c + ' ' in nome1 or nome1 == c:
                _cats1.add(_CAT_EQUIV.get(c, c))
            if nome2.startswith(c + ' ') or c + ' ' in nome2 or nome2 == c:
                _cats2.add(_CAT_EQUIV.get(c, c))
        if _cats1 and _cats2 and not _cats1.intersection(_cats2):
            return True

        if _azeites_incompativeis(nome1, nome2):
            return True

        d1 = _extrair_dimensoes_papel_alum(nome1)
        d2 = _extrair_dimensoes_papel_alum(nome2)
        if d1 and d2 and not d1.intersection(d2):
            return True

        if ('QUEROSENE' in nome1 and 'DESINF' in nome2) or ('QUEROSENE' in nome2 and 'DESINF' in nome1):
            return True

        if _coco_ralado_flocos_incompativeis(nome1, nome2):
            return True

        if _coco_ralado_sem_acucar_incompativel(nome1, nome2):
            return True

        if _extrato_tomate_incompativel(nome1, nome2):
            return True

        if _ketchup_marca_incompativel(nome1, nome2):
            return True

        if _maionese_limao_incompativel(nome1, nome2):
            return True

        if _molho_marca_variedade_incompativel(nome1, nome2):
            return True

        if _atum_sardinha_variante_incompativel(nome1, nome2):
            return True

        if _conhecimento_produto_incompativel(nome1, nome2):
            return True

        if _sabores_caldo_incompativeis(nome1, nome2):
            return True

        # 1b. TRAVA DE ÁLCOOL — VODKA ≠ APERITIVO ≠ CACHAÇA ≠ AGUARDENTE ≠ CONHAQUE ≠ WHISKY
        _ALCOOL = {'VODKA', 'APERITIVO', 'CACHAC', 'AGUARD', 'CONHAQUE', 'WHISKY'}
        a1 = set(nome1.split()) & _ALCOOL
        a2 = set(nome2.split()) & _ALCOOL
        if a1 and a2 and not a1.intersection(a2):
            return True

        # 2. TRAVA DE MARCA + CROSS-CATEGORY SAME-BRAND
        for categoria, marcas_set in MARCAS_POR_CATEGORIA.items():
            cat_aplica_1 = nome1.startswith(categoria + ' ') or categoria + ' ' in nome1
            cat_aplica_2 = nome2.startswith(categoria + ' ') or categoria + ' ' in nome2
            if not (cat_aplica_1 or cat_aplica_2):
                continue
            marcas1 = set()
            marcas2 = set()
            for marca in sorted(marcas_set, key=len, reverse=True):
                padrao_marca = r'(?:^|(?<=\s))' + re.escape(marca) + r'(?=\s|$)'
                if re.search(padrao_marca, nome1):
                    marcas1.add(marca)
                if re.search(padrao_marca, nome2):
                    marcas2.add(marca)
            if marcas1 and marcas2 and not marcas1.intersection(marcas2):
                return True
            # Cross-category same-brand: mesma marca mas categorias diferentes → bloqueia
            shared = marcas1.intersection(marcas2)
            if shared and cat_aplica_1 != cat_aplica_2:
                return True

        # 3. TRAVA DE PACK SIZE (C4 ≠ C8 ≠ C12, L12P ≠ L4P) — SEMPRE bloqueia
        def _extract_packs(name):
            packs = set()
            for m in re.finditer(r'\bC(\d+)\b', name):
                packs.add(m.group(1))
            for m in re.finditer(r'L(\d+)P', name):
                packs.add(m.group(1))
            return packs
        pack1 = _extract_packs(nome1)
        pack2 = _extract_packs(nome2)
        if pack1 and pack2 and not pack1.intersection(pack2):
            return True

        # 4. TRAVA DE SABOR FRUTA (sabores diferentes = produto diferente)
        _SABORES_FRUTA = {
            'ABACAXI', 'ACEROLA', 'AMORA', 'BANANA', 'CAJU', 'CARAMBOLA',
            'CEREJA', 'COCO', 'FRAMBOESA', 'GOIABA', 'GRAPE', 'GUARANA',
            'JABUTICABA', 'LARANJA', 'LIMAO', 'MACA', 'MAMAO', 'MANGA',
            'MARACUJA', 'MELANCIA', 'MORANGO', 'PESSEGO', 'TANGERINA',
            'TAMARINDO', 'UVA', 'UVAIA',
        }
        tokens1 = set(re.findall(r'[A-Z]{3,}', nome1))
        tokens2 = set(re.findall(r'[A-Z]{3,}', nome2))
        sabores1 = tokens1 & _SABORES_FRUTA
        sabores2 = tokens2 & _SABORES_FRUTA
        if sabores1 and sabores2 and not sabores1.intersection(sabores2):
            return True

        # 5. PO vs LIQ
        tem_po_n1  = 'PO' in nome1.split() or 'LAVA ROUPA PO' in nome1
        tem_po_n2  = 'PO' in nome2.split() or 'LAVA ROUPA PO' in nome2
        tem_liq_n1 = bool({'LIQ', 'LQ'} & set(nome1.split())) or 'LAVA ROUPA LIQ' in nome1 or 'LAVA ROUPA LQ' in nome1
        tem_liq_n2 = bool({'LIQ', 'LQ'} & set(nome2.split())) or 'LAVA ROUPA LIQ' in nome2 or 'LAVA ROUPA LQ' in nome2
        if (tem_po_n1 and tem_liq_n2) or (tem_liq_n1 and tem_po_n2):
            return True

        # 5b. LT (lata) vs SC (sachê/saco) em alimentos
        _CATS_LT_SC = ('MILHO', 'ERVILHA', 'ATUM', 'SARD')
        if any(c in nome1 or c in nome2 for c in _CATS_LT_SC):
            _lt1 = bool(re.search(r'(?<![A-Z0-9])LT(?![A-Z0-9])', nome1))
            _lt2 = bool(re.search(r'(?<![A-Z0-9])LT(?![A-Z0-9])', nome2))
            _sc1 = bool(re.search(r'(?<![A-Z0-9])SC(?![A-Z0-9])', nome1))
            _sc2 = bool(re.search(r'(?<![A-Z0-9])SC(?![A-Z0-9])', nome2))
            if (_lt1 and _sc2) or (_sc1 and _lt2):
                return True

        # 6. BLOQUEIO DE MARCA DESCONHECIDA NA CATEGORIA
        todas_marcas_flat = set()
        for marcas in MARCAS_POR_CATEGORIA.values():
            todas_marcas_flat.update(marcas)
        for marca in todas_marcas_flat:
            if re.search(r'(?:^|(?<=\s))' + re.escape(marca) + r'(?=\s|$)', nome1):
                for cat, marcas_cat in MARCAS_POR_CATEGORIA.items():
                    if marca not in marcas_cat:
                        continue
                    if not (nome1.startswith(cat + ' ') or cat + ' ' in nome1 or nome1 == cat):
                        continue
                    # nome1 tem marca conhecida; nome2 tem OUTRA marca da mesma categoria → bloqueia
                    for marca2 in marcas_cat:
                        if marca2 == marca:
                            continue
                        if re.search(r'(?:^|(?<=\s))' + re.escape(marca2) + r'(?=\s|$)', nome2):
                            return True
                    # nome1 tem marca desta categoria, nome2 não tem nenhuma marca dela → bloqueia
                    tem_marca2 = any(
                        re.search(r'(?:^|(?<=\s))' + re.escape(m2) + r'(?=\s|$)', nome2)
                        for m2 in marcas_cat
                    )
                    if not tem_marca2:
                        return True

        # 7. TRAVA DE PESO — bloqueia pesos incompatíveis
        _c1 = _extrair_medidas(nome1)
        _c2 = _extrair_medidas(nome2)
        if _c1 and _c2 and not _c1.intersection(_c2):
            _tol_peso = _tolerancia_medida(nome1, nome2)
            _pesos_ok = False
            for _p1 in _c1:
                _v1 = _peso_para_numero(_p1)
                for _p2 in _c2:
                    _v2 = _peso_para_numero(_p2)
                    if _v1 and _v2 and _v1 > 0 and _v2 > 0:
                        if min(_v1, _v2) / max(_v1, _v2) >= _tol_peso:
                            _pesos_ok = True
                            break
                if _pesos_ok:
                    break
            if not _pesos_ok:
                return True

        # 7b. TRAVA DE PESO IMPLÍCITO — número sem unidade vs peso explícito
        def _bare(nome):
            return [int(m) for m in re.findall(r'(?<!\d)(\d{2,4})(?!\d|G|KG|ML|L)', nome)
                    if 50 <= int(m) <= 2000]
        if not _c1 and _c2:
            for bv in _bare(nome1):
                for _p2 in _c2:
                    _v2 = _peso_para_numero(_p2)
                    if _v2 and _v2 > 0 and min(bv, _v2) / max(bv, _v2) < 0.7:
                        return True
        elif _c1 and not _c2:
            for bv in _bare(nome2):
                for _p1 in _c1:
                    _v1 = _peso_para_numero(_p1)
                    if _v1 and _v1 > 0 and min(bv, _v1) / max(bv, _v1) < 0.7:
                        return True

        # 7c. TRAVA ATUM/SARD: SOLIDO vs RALADO vs PEDACOS
        _ATUM_CATS = ('ATUM', 'SARD')
        if any(c in nome1 or c in nome2 for c in _ATUM_CATS):
            _TIPOS_ATUM = {'SOLIDO', 'PEDACO', 'RALADO'}
            tipo1 = next((t for t in _TIPOS_ATUM if re.search(r'\b' + t + r'\b', nome1)), None)
            tipo2 = next((t for t in _TIPOS_ATUM if re.search(r'\b' + t + r'\b', nome2)), None)
            if tipo1 and tipo2 and tipo1 != tipo2:
                return True

        if ('VIN ' in nome1 or nome1.startswith('VIN')) and ('VIN ' in nome2 or nome2.startswith('VIN')):
            _cores = {'TINTO', 'BRANCO', 'ROSE'}
            cor1 = set(nome1.split()) & _cores
            cor2 = set(nome2.split()) & _cores
            if cor1 and cor2 and not cor1.intersection(cor2):
                return True

        if any(cat in nome1 or cat in nome2 for cat in ('SH ', 'COND ')):
            kit1 = '+COND' in nome1 or 'SH COND' in nome1
            kit2 = '+COND' in nome2 or 'SH COND' in nome2
            if kit1 != kit2:
                return True

        if 'TRIDENT' in nome1 and 'TRIDENT' in nome2:
            pote1 = 'POTE' in nome1.split()
            pote2 = 'POTE' in nome2.split()
            if pote1 != pote2:
                return True

        if ('APAR' in nome1 or 'BARB' in nome1) and ('APAR' in nome2 or 'BARB' in nome2):
            _linhas = {'SOLEIL', 'SENSIVEL', 'SENSITIVE', 'INTENSITY', 'COMFORT', 'VENUS'}
            l1 = set(nome1.split()) & _linhas
            l2 = set(nome2.split()) & _linhas
            if l1 and l2 and not l1.intersection(l2):
                return True

        return False

def _candidatos_rapidos(n_site, n_site_ord, precos_nome_lista, norms_cache, limit=100, score_cutoff=40):
        """Retorna lista de items da precos_nome_lista ordenados por score fuzz, acima do cutoff."""
        if _USE_RAPIDFUZZ and norms_cache is not None:
            # rfprocess.extract retorna (string, score, index) em ordem decrescente
            resultados = rfprocess.extract(
                n_site, norms_cache,
                scorer=fuzz.token_set_ratio,
                limit=limit,
                score_cutoff=score_cutoff
            )
            return [precos_nome_lista[idx] for _, _, idx in resultados]
        # fallback: retorna tudo
        return precos_nome_lista

def encontrar_preco(ean, nome_original, precos_dict, precos_nome_lista, norms_cache):
        """Motor de matching v5.0 — 3 camadas para maximizar acertos."""
        # 1. Busca por EAN (Prioridade máxima)
        ean_limpo = limpar_ean(ean)
        if ean_limpo and ean_limpo in precos_dict:
            return precos_dict[ean_limpo], "EAN"

        # 2. Busca por Nome — MOTOR EM 3 CAMADAS
        n_site = normalizar_nome(nome_original)
        if not n_site:
            return None, None

        n_site_ord = ordenar_palavras(n_site)

        # Pré-filtro rápido: top-100 candidatos por score fuzz (O(N) com C-speed)
        # Travas são checadas só nos candidatos pré-filtrados → muito mais rápido
        candidatos = _candidatos_rapidos(n_site, n_site_ord, precos_nome_lista, norms_cache, limit=40, score_cutoff=55)

        # ═══════════════════════════════════════════════════════════
        # CAMADA 1: Matching padrão (75% + travas rigorosas)
        # ═══════════════════════════════════════════════════════════
        melhor_nota, preco_candidato, melhor_orig = 0, None, None

        for item in candidatos:
            nota_sort = fuzz.token_sort_ratio(n_site_ord, item['ord'])  / 100.0
            nota_set  = fuzz.token_set_ratio(n_site, item['norm'])      / 100.0
            nota = max(nota_sort, nota_set)

            if nota < TAXA_SIMILARIDADE or nota <= melhor_nota:
                continue
            if nomes_incompativeis_v4(n_site, item['norm']):
                continue

            if nota > melhor_nota:
                melhor_nota = nota
                preco_candidato = item['preco']
                melhor_orig = item['orig']

        if melhor_nota >= TAXA_SIMILARIDADE:
            return preco_candidato, f"SIMILAR {int(melhor_nota * 100)}%"

        # ═══════════════════════════════════════════════════════════
        # CAMADA 2: Matching relaxado (65%) — mesma categoria + marca
        # Usa travas mais brandas: só bloqueia categorias cruzadas e marcas
        # totalmente diferentes. Aceita pesos próximos.
        # ═══════════════════════════════════════════════════════════
        TAXA_CAMADA2 = 0.65
        melhor_nota2, preco_candidato2 = 0, None

        for item in candidatos:
            nota_sort = fuzz.token_sort_ratio(n_site_ord, item['ord'])  / 100.0
            nota_set  = fuzz.token_set_ratio(n_site, item['norm'])      / 100.0
            nota = max(nota_sort, nota_set)

            if nota < TAXA_CAMADA2 or nota <= melhor_nota2:
                continue
            # Travas reduzidas: só categoria e marca
            if _travas_leves(n_site, item['norm']):
                continue

            if nota > melhor_nota2:
                melhor_nota2 = nota
                preco_candidato2 = item['preco']

        if melhor_nota2 >= TAXA_CAMADA2:
            return preco_candidato2, f"SIMILAR {int(melhor_nota2 * 100)}%"

        # ═══════════════════════════════════════════════════════════
        # CAMADA 3: Matching por categoria + marca obrigatória
        # Threshold mais baixo (55%) mas exige mesma categoria E
        # mesma marca quando o produto buscado tem marca conhecida.
        # ═══════════════════════════════════════════════════════════
        TAXA_CAMADA3 = 0.62
        melhor_nota3, preco_candidato3 = 0, None

        cat_site = _extrair_categoria(n_site)
        marca_site = _extrair_marca(n_site)

        if cat_site:
            for item in candidatos:
                cat_item = _extrair_categoria(item['norm'])

                # 1. Deve ter mesma categoria
                if not (cat_site and cat_item and cat_site == cat_item):
                    continue

                # 2. Se produto buscado tem marca conhecida → match DEVE ter mesma marca
                if marca_site:
                    padrao_marca = r'(?:^|(?<=\s))' + re.escape(marca_site) + r'(?=\s|$)'
                    if not re.search(padrao_marca, item['norm']):
                        continue

                nota_sort = fuzz.token_sort_ratio(n_site_ord, item['ord'])  / 100.0
                nota_set  = fuzz.token_set_ratio(n_site, item['norm'])      / 100.0
                nota = max(nota_sort, nota_set)

                if nota < TAXA_CAMADA3 or nota <= melhor_nota3:
                    continue
                # 3. Travas de embalagem (LT vs SC) também se aplicam na camada 3
                if nomes_incompativeis_v4(n_site, item['norm']):
                    continue

                if nota > melhor_nota3:
                    melhor_nota3 = nota
                    preco_candidato3 = item['preco']

            if melhor_nota3 >= TAXA_CAMADA3:
                return preco_candidato3, f"APROX {int(melhor_nota3 * 100)}%"

        return None, None


def processar_cotacao(itens_cotacao, precos_dict, precos_nome_lista, modo="completo"):
    """
    Processa matching para uma lista de itens de cotacao.

    Args:
        itens_cotacao: lista de {"ean": str, "nome": str, "linha": int}
        precos_dict: dict ean_str -> preco_float
        precos_nome_lista: lista de {"norm", "ord", "preco", "orig"}
        modo: "ean" (so codigo de barras) ou "completo" (EAN + 3 camadas)

    Returns:
        lista de {"linha": int, "preco": float|None, "tipo": str|None}
    """
    results = []
    modo = str(modo or "completo").strip().lower()
    norms_cache = [item['norm'] for item in precos_nome_lista]

    for item in itens_cotacao:
        if modo == "ean":
            ean_limpo = limpar_ean(item.get("ean", ""))
            preco = precos_dict.get(ean_limpo) if ean_limpo else None
            tipo = "EAN" if preco is not None else None
            results.append({"linha": item.get("linha", 0), "preco": preco, "tipo": tipo})
        else:
            preco, tipo = encontrar_preco(
                item.get("ean", ""), item.get("nome", ""),
                precos_dict, precos_nome_lista, norms_cache
            )
            results.append({"linha": item.get("linha", 0), "preco": preco, "tipo": tipo})

    return results


def processar_cotacao_com_ia(itens_cotacao, precos_dict, precos_nome_lista, modo="completo"):
    """
    Compatibilidade com chamadas antigas: executa somente o matching por codigo.
    A camada Gemini foi desativada para evitar custo de IA no processamento.
    """
    return processar_cotacao(itens_cotacao, precos_dict, precos_nome_lista, modo=modo)
