/* Logica de todo el juego */

/* SISTEMA DE COORDENADAS:
    - Bloque 1x1x1
    - Eje X -> Derecha (avance del jugador)
    - Eje Y -> Arriba (altura del jugador)
    - Eje Z -> Adelante (profundidad del jugador)
*/
import * as THREE from 'three';

const CONFIG = {
    GRAVEDAD: -32,
    VEL_CAMINAR: 6,
    VEL_CORRER: 9,
    ACELERACION: 40,
    FRICCION: 30,
    FUERZA_SALTO: 15,
    CORTE_SALTO: 0.45,
    VEL_MAX_CAIDA: -20,
    TIEMPO_COYOTE: 0.1,
    BUFFER_SALTO: 0.12,
    VIDAS_INICIALES: 3,
    TIEMPO_NIVEL: 300,
    LIMITE_CAIDA: -5,
    VEL_ENEMIGO: 1.5,
    INVULNERABLE: 2.0,
};

/* Diseño del nivel (TILEMAP) */
/* **************************************************
    # Suelo
    G bloque sorpresa
    C Columna de piedra
    E Enemigo
    K Punto de control
    B ladrillo (se puede romper)
    S bloque de piedra (escaleras)
    o Coleccionable (gema)
    P Jugador (posición inicial)
    F Bandera de Meta
***************************************************** */
const MAPA_NIVEL = [
    "                                                                                ",
    "                                      ooo                                       ",
    "   #      G             ooo           ooooo                                      ",
    "   #                   BBBBB         ooooooo                                   F ",
    "   #                                   BBB                   S                 # ",
    "   # P    G   G                       E                     SS                 # ",
    "   ###  #######  #   K   #  ##C##   #####   ##B#B##       SSS                ###",
    "################ ################ ################ ################ ################",
];

const MAPA_NIVEL_2 = [
    "                                                                                                    ",
    "                                          o                                                         ",
    "   #          ooo                                             oooooo                                ",
    "   #      G   BGBooooo    o             ooooo    oo                                         S   F   ",
    "   #             BBBBB    C             BBBBB    SS           BGBBGB                       SS  ###  ",
    "   #  P                   C                     SSSS                                      SSS  ###  ",
    "   ###       E            C    K    E          SSSSSS   E            K     E   E         SSSS  ###  ",
    "##################   ####################   ###################    #################   #############",
]

// Lista de niveles en orden (todos usan los mismos materiales)
const MAPAS = [MAPA_NIVEL, MAPA_NIVEL_2];
let nivelActual = 1;

const SOLIDOS = new Set(["#", "B", "G", "S", "C", "K", "F"]);

const COLOR_CIELO = 0x6ec6ff;

const scene = new THREE.Scene();
const texFondo = new THREE.TextureLoader().load('./src/img/texture/fondo.jpg');
texFondo.colorSpace = THREE.SRGBColorSpace;
scene.background = texFondo;

// FOG
scene.fog = new THREE.Fog(COLOR_CIELO, 25, 60);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5, 5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

const light = new THREE.AmbientLight( 0x404040, 50); // soft white light
scene.add( light );


window.addEventListener('resize', () => {
    // 1. Actualizar el tamaño del renderizador
    renderer.setSize(window.innerWidth, window.innerHeight);

    // 2. Actualizar la relación de aspecto de la cámara
    camera.aspect = window.innerWidth / window.innerHeight;

    // 3. Renderizar los cambios en la matriz de proyección
    camera.updateProjectionMatrix();
});


/* Diseño del nivel (TILEMAP) */
/* ************************************************** */
let grupoNivel = null,
    bloques = new Map(),
    gemas = [],
    enemigos = [],
    particulas = [],
    posicionInicial = { x: 2.5, y: 1 },
    puntoControl = null,
    banderaMeta = null;
/* ************************************************** */

const clave = (x, y) => x + "," + y;

function construirNivel(indice) {
    // Eliminar el grupo de nivel anterior
    if (grupoNivel) scene.remove(grupoNivel);

    grupoNivel = new THREE.Group();
    scene.add(grupoNivel);

    bloques = new Map();
    gemas = [];
    enemigos = [];
    particulas = [];

    const mapa = MAPAS[indice];
    const alto = mapa.length;
    mapa.forEach((fila, y) => {
        const yMundo = alto - 1 - y; // Invertir el eje Y para que (0,0) esté en la esquina inferior izquierda

        for (let index = 0; index < fila.length; index++) {
            const element = fila[index];
            //Para que la camara siga al jugador 
            if(element == "P"){
                posicionInicial = {
                    x : index + 0.5,
                    y : yMundo + 0.5
                }
            }
            if (SOLIDOS.has(element)) {
                // Crear un bloque sólido
                crearBloque(index, yMundo, element);
            }
        }

    })
}

// 1. Crear el cargador de texturas
const textureLoader = new THREE.TextureLoader();
// 2. Cargar la imagen especificando su ruta (local o URL externa)
const texTierra = textureLoader.load('./src/img/texture/ground.jpg');
const texSuelo = textureLoader.load('./src/img/texture/pasto.jpg');
const texLadrillo = textureLoader.load('./src/img/texture/ladrillo.jpg');
const texSorpresa = textureLoader.load('./src/img/texture/sorpresa.jpg');
const textFondo = textureLoader.load('./src/img/texture/fondo.jpg');
// Colores correctos (evita que las texturas se vean lavadas)
texTierra.colorSpace = texSuelo.colorSpace = texLadrillo.colorSpace = THREE.SRGBColorSpace;

// CREAR EL MATERIAL
const MATERIALES = {
    cielo: new THREE.MeshLambertMaterial({map: textFondo}),
    suelo: new THREE.MeshLambertMaterial({map: texSuelo}), 
    tierra: new THREE.MeshLambertMaterial({map: texTierra}), 
    ladrillo: new THREE.MeshLambertMaterial({map: texLadrillo}),
    sorpresa: new THREE.MeshLambertMaterial({map: texSorpresa}),
    
}

const GEO_BLOQUE = new THREE.BoxGeometry(1,1,1);
const GEO_GEMA = new THREE.OctahedronGeometry(0.28);

// sorpresa: ,
//     piedra: ,
//     columna: , 
//     gema: 
function crearBloque(x,y,tipo) {
    // Seleccionar el material que se le va a colocar al bloque

    const material = {
        "#": MATERIALES.suelo,
        "B": MATERIALES.ladrillo,
        "G": MATERIALES.sorpresa,
    }[tipo];

    const malla = new THREE.Mesh(GEO_BLOQUE,material);

    malla.position.set(x+0.5,y+0.5,0);
    grupoNivel.add(malla);
    bloques.set(clave(x,y), {x,y,tipo, malla, rebote:0});

    if(tipo==="#"){
        const tierra = new THREE.Mesh(new THREE.BoxGeometry(1,4,1),MATERIALES.tierra);
        tierra.position.set(x+0.5,y-2,0);
        grupoNivel.add(tierra);
    }

}

function animate(time) {
    renderer.render(scene, camera);
}

// Construir el nivel una sola vez (no dentro de animate)
construirNivel(nivelActual);
//CAMARA SIGUE AL JUGADOR POR P
camera.position.set(posicionInicial.x + 6, posicionInicial.y + 3, 14);
camera.lookAt(posicionInicial.x + 6, posicionInicial.y + 1, 0);

