from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_banxico_resumen_endpoint():
    res = client.get('/api/banxico/resumen')
    assert res.status_code == 200
    data = res.json()
    assert data['estado'] == 'operativo'
    assert 'cetes_28d' in data['indicadores']
    assert 'udi' in data['indicadores']
    assert 'tipo_cambio_fix' in data['indicadores']

def test_banxico_serie_endpoint():
    res = client.get('/api/banxico/series/SP68257')
    assert res.status_code == 200
    data = res.json()
    assert data['serie'] == 'SP68257'
    assert 'observaciones' in data
    assert len(data['observaciones']) > 0

def test_banxico_catalogo_endpoint():
    res = client.get('/api/banxico/catalogo')
    assert res.status_code == 200
    data = res.json()
    assert len(data['series']) >= 4

def test_inegi_resumen_endpoint():
    res = client.get('/api/inegi/resumen')
    assert res.status_code == 200
    data = res.json()
    assert data['estado'] == 'operativo'
    assert 'inflacion_general' in data
    assert len(data['rubros']) == 7

def test_inegi_inpc_endpoint():
    res = client.get('/api/inegi/inpc')
    assert res.status_code == 200
    data = res.json()
    assert 'dates' in data
    assert 'general' in data['series']
    assert 'alimentos' in data['series']

def test_inegi_indicador_endpoint():
    res = client.get('/api/inegi/indicador/628194')
    assert res.status_code == 200
    data = res.json()
    assert data['indicador'] == '628194'
    assert 'observaciones' in data

def test_fuentes_estado_endpoint():
    res = client.get('/api/fuentes/estado')
    assert res.status_code == 200
    data = res.json()
    assert data['fuentes']['banxico']['estado'] == 'operativo'
    assert data['fuentes']['inegi']['estado'] == 'operativo'
    assert data['fuentes']['yahoo_finance']['estado'] == 'operativo'
