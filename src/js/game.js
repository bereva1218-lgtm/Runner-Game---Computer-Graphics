/* =====================================================================
   RUNNER GAME — Lógica de todo el juego (texturas desde imágenes)

   ÍNDICE
     1.  Configuración
     2.  Diseño del nivel (TILEMAP)
     3.  Escena, cámara, renderizador y luces
     4.  Texturas desde imágenes (TextureLoader + LoadingManager)
     5.  Modelos 3D: jugador (vaquero), enemigo, bandera
     6.  Construcción del nivel
     7.  Entrada del teclado
     8.  Física y colisiones
     9.  Bloques: romper bloques sorpresa y ladrillos con gema
     10. Jugador
     11. Enemigos
     12. Partículas y animaciones del nivel
     13. Cámara que sigue al jugador
     14. Interfaz (HUD y pantallas)
     15. Estados del juego y bucle principal (animate)
     16. Decoración de fondo (desierto al atardecer)
     17. Sonidos (efectos y música)
     18. Arranque

   SISTEMA DE COORDENADAS:
     - Bloque 1x1x1
     - Eje X -> Derecha (avance del jugador)
     - Eje Y -> Arriba (altura del jugador)
     - Eje Z -> Adelante (profundidad, solo visual: el juego se mueve en X e Y)
       El nivel jugable está en z = 0; la decoración, detrás (z negativo).

   ESTRUCTURA DE CARPETAS
     index.html
     src/css/style.css
     src/js/game.js      ← este archivo
     src/img/texture/    ground.jpg, pasto.jpg, ladrillo.jpg, piedra.jpg,
                         sorpresa.jpg
     (Los sonidos se sintetizan en el navegador: no hay carpeta src/audio/)
   ===================================================================== */
import * as THREE from 'three';


/* =====================================================================
   1. CONFIGURACIÓN
   Cambiar estos números cambia cómo "se siente" el juego.
   ===================================================================== */
const CONFIG = {
    GRAVEDAD: -32,          // aceleración hacia abajo (unidades/segundo²)
    VEL_CAMINAR: 6,         // velocidad máxima caminando
    VEL_CORRER: 9,          // velocidad máxima con SHIFT
    ACELERACION: 40,        // qué tan rápido alcanza la velocidad máxima
    FRICCION: 30,           // qué tan rápido frena al soltar las teclas
    FUERZA_SALTO: 15,       // velocidad vertical inicial del salto
    CORTE_SALTO: 0.45,      // si sueltas el botón antes, el salto se corta
    VEL_MAX_CAIDA: -20,     // límite de velocidad al caer
    TIEMPO_COYOTE: 0.1,     // gracia para saltar justo después de salir del borde
    BUFFER_SALTO: 0.12,     // si presionas saltar un poco antes de tocar el suelo, igual salta
    VIDAS_INICIALES: 3,
    TIEMPO_NIVEL: 300,      // segundos para completar el nivel
    LIMITE_CAIDA: -5,       // si el jugador baja de esta Y, se cayó al vacío
    VEL_ENEMIGO: 1.5,
    INVULNERABLE: 2.0,      // segundos de invulnerabilidad tras perder una vida
};


/* =====================================================================
   2. DISEÑO DEL NIVEL (TILEMAP)
   Cada carácter es una casilla de 1x1. La PRIMERA fila es la de ARRIBA.
   **************************************************
    # Suelo                    B bloque sorpresa "?" (se rompe y desaparece)
    G ladrillo con gema        S bloque de piedra (escaleras)
    C Columna de piedra        o Coleccionable (gema)
    E Enemigo                  P Jugador (posición inicial)
    K Punto de control         F Bandera de Meta
   ***************************************************** */
const MAPA_NIVEL = [
  "",
  "                                                                   ooo                               SS",
  "          G                                                        BBB                              SSS",
  "                              oooo                                                                 SSSS",
  "                              BBBB                    SS   S                                      SSSSS",
  "        GBGBG                                        SSS   SS     BGBGB          oo   GGG        SSSSSS",
  "                    C                     C         SSSS   SSS                                  SSSSSSS",
  "  P            E    C               E E   C    E   SSSSS   SSSS K       E E               E    SSSSSSSS   F",
  "#########################  #############################   ######################  ###########################",
];

// Caracteres SÓLIDOS: el jugador choca con ellos.
// OJO: K (punto de control) y F (meta) NO van aquí. No son bloques: son objetos
// que el jugador debe ATRAVESAR para activarlos. Si fueran sólidos, la meta
// sería una pared y nunca se podría ganar.
// U = ladrillo con gema ya usado (no está en el mapa: aparece cuando golpeas una G).
const SOLIDOS = new Set(["#", "B", "G", "S", "C", "U"]);


/* =====================================================================
   3. ESCENA, CÁMARA, RENDERIZADOR Y LUCES
   ===================================================================== */
// Colores del cielo al atardecer (los usa la cúpula del cielo, sección 16).
// La niebla usa el MISMO color del horizonte: así lo lejano se funde con
// el cielo sin que se note dónde termina el escenario.
const COLOR_CIELO_ARRIBA = 0x2b1e4f;   // violeta oscuro
const COLOR_CIELO_MEDIO = 0xd8606f;    // rosado
const COLOR_HORIZONTE = 0xffb36b;      // naranja claro

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR_HORIZONTE);   // de respaldo: el degradado lo pinta la cúpula
// FOG: lo lejano se mezcla con el horizonte (da profundidad).
// Empieza a 20 unidades (el nivel está a ~14 de la cámara y no se nubla)
// y a 150 ya lo cubre todo: las montañas quedan como siluetas suaves.
scene.fog = new THREE.Fog(COLOR_HORIZONTE, 20, 150);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(5, 5, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // máx. 2: nítido sin exigir demasiado a la GPU
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;   // (PCFSoftShadowMap ya no existe en esta versión de Three.js)
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
    // 1. Actualizar el tamaño del renderizador
    renderer.setSize(window.innerWidth, window.innerHeight);
    // 2. Actualizar la relación de aspecto de la cámara
    camera.aspect = window.innerWidth / window.innerHeight;
    // 3. Recalcular la matriz de proyección con el nuevo aspecto
    camera.updateProjectionMatrix();
});

// LUCES
// Una AmbientLight sola ilumina todo por igual: no hay sombras ni volumen
// (los cubos se ven planos). Por eso combinamos dos luces:
//  - HemisphereLight: luz de relleno, color del cielo arriba y de la arena abajo.
//  - DirectionalLight: el "sol". Es la única de las dos que proyecta sombras.
// Colores cálidos (anaranjados): es la luz del atardecer.
const luzAmbiente = new THREE.HemisphereLight(0xffe2c4, 0x8a5a44, 2.2);
scene.add(luzAmbiente);

const luzSol = new THREE.DirectionalLight(0xffcf9e, 2.6);
luzSol.castShadow = true;
luzSol.shadow.mapSize.set(2048, 2048);     // resolución de la sombra
luzSol.shadow.camera.left = -22;           // zona que recibe sombras
luzSol.shadow.camera.right = 22;
luzSol.shadow.camera.top = 15;
luzSol.shadow.camera.bottom = -10;
luzSol.shadow.camera.near = 1;
luzSol.shadow.camera.far = 60;
scene.add(luzSol);
scene.add(luzSol.target);                  // el objetivo de la luz también va en la escena


/* =====================================================================
   4. TEXTURAS DESDE IMÁGENES
   - TextureLoader descarga una imagen y la convierte en textura.
   - La carga es ASÍNCRONA: load() devuelve la textura de inmediato (vacía)
     y la imagen llega después. Por eso usamos un LoadingManager, que nos
     avisa cuando TODAS las imágenes terminaron de cargar.
   - Las rutas son relativas al index.html (no a este archivo .js).
     Por eso escribimos './src/img/texture/' y no '../img/texture/'.
   ===================================================================== */
const RUTA_TEXTURAS = './src/img/texture/';

// 1. El LoadingManager vigila todas las cargas
const manager = new THREE.LoadingManager();

manager.onProgress = (url, cargadas, total) => {
    // Mostramos el progreso en el botón de jugar
    const boton = document.getElementById('btn-jugar');
    if (boton) boton.textContent = `CARGANDO ${cargadas}/${total}`;
};

manager.onLoad = () => {
    // Todas las texturas listas: habilitamos el botón
    const boton = document.getElementById('btn-jugar');
    if (boton) { boton.textContent = 'JUGAR'; boton.disabled = false; }
};

manager.onError = (url) => {
    // Error típico: la ruta está mal escrita o el archivo no existe.
    console.error(`No se pudo cargar la textura: ${url}. Revisa la ruta y el nombre del archivo.`);
};

// 2. Crear el cargador de texturas usando el manager
const textureLoader = new THREE.TextureLoader(manager);

// 3. Función de ayuda: carga una imagen y la configura
function cargarTextura(archivo) {
    // El segundo parámetro de load() es una función que se ejecuta cuando la imagen YA llegó
    const textura = textureLoader.load(RUTA_TEXTURAS + archivo, (tex) => {
        // Corrección de proporción: cada cara del cubo es cuadrada (1x1).
        // Si la imagen no es cuadrada (ej. ladrillo.jpg es 1024x512), se vería
        // estirada. Con repeat mostramos solo una porción cuadrada de la imagen.
        const { width, height } = tex.image;
        if (width > height) tex.repeat.set(height / width, 1);   // más ancha: recortamos en X
        if (height > width) tex.repeat.set(1, width / height);   // más alta: recortamos en Y
    });
    // Indica que la imagen está en sRGB. Sin esto los colores se ven lavados.
    textura.colorSpace = THREE.SRGBColorSpace;
    // Filtrado anisotrópico: la textura se ve nítida aunque la cara esté inclinada
    // respecto a la cámara (por ejemplo, el pasto visto desde arriba en ángulo).
    textura.anisotropy = renderer.capabilities.getMaxAnisotropy();
    // Para un look pixel-art se usaría: textura.magFilter = THREE.NearestFilter;
    // Con fotos realistas dejamos el filtro por defecto (LinearFilter), que suaviza.
    return textura;
}

const texTierra    = cargarTextura('ground.jpg');
// La tierra de relleno es una caja de 1x4: si usamos la imagen una sola vez,
// se ve estirada 4 veces hacia abajo. Con RepeatWrapping + repeat(1, 4)
// la imagen se REPITE 4 veces en vertical y conserva su proporción.
// (El navegador guarda la imagen en caché: cargarla dos veces no la descarga dos veces.)
const texTierraRelleno = cargarTextura('ground.jpg');
texTierraRelleno.wrapS = THREE.RepeatWrapping;
texTierraRelleno.wrapT = THREE.RepeatWrapping;
texTierraRelleno.repeat.set(1, 4);
const texSuelo     = cargarTextura('pasto.jpg');       // parte de arriba del suelo
const texLadrillo  = cargarTextura('ladrillo.jpg');
const texSorpresa  = cargarTextura('sorpresa.jpg');
const texPiedra    = cargarTextura('piedra.jpg');

// CREAR LOS MATERIALES
// MeshLambertMaterial: material sencillo que reacciona a la luz.
// Los lados del suelo usan la misma imagen de tierra (ground.jpg)
const matSueloLado = new THREE.MeshLambertMaterial({ map: texTierra });
const MATERIALES = {
    // Un BoxGeometry tiene 6 caras, en este orden: [+X, -X, +Y (arriba), -Y (abajo), +Z, -Z]
    // Pasando un ARREGLO de materiales, cada cara usa uno distinto.
    suelo: [
        matSueloLado,
        matSueloLado,
        new THREE.MeshLambertMaterial({ map: texSuelo }),   // arriba: pasto
        new THREE.MeshLambertMaterial({ map: texTierra }),  // abajo: tierra
        matSueloLado,
        matSueloLado,
    ],
    tierra:   new THREE.MeshLambertMaterial({ map: texTierraRelleno }),
    ladrillo: new THREE.MeshLambertMaterial({ map: texLadrillo }),
    // emissive: el bloque "brilla" un poco aunque esté en sombra
    sorpresa: new THREE.MeshLambertMaterial({ map: texSorpresa, emissive: 0x332200 }),
    // Ladrillo ya usado: la misma imagen oscurecida. "color" se MULTIPLICA por la textura.
    usado:    new THREE.MeshLambertMaterial({ map: texLadrillo, color: 0x8a7a70 }),
    piedra:   new THREE.MeshLambertMaterial({ map: texPiedra }),
    // Columna: la misma piedra con un tono arenisca, para distinguirla de las escaleras
    columna:  new THREE.MeshLambertMaterial({ map: texPiedra, color: 0xe6c9a3 }),
    // La gema no usa imagen: un color brillante se ve mejor en un objeto pequeño
    gema:     new THREE.MeshPhongMaterial({ color: 0x26c6da, emissive: 0x0b5560, shininess: 100 }),
    // Metal dorado: hebilla del vaquero y bola de las banderas
    dorado:   new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x664400 }),
};

// Reutilizamos UNA sola geometría para todos los bloques (ahorra memoria)
const GEO_BLOQUE = new THREE.BoxGeometry(1, 1, 1);
const GEO_TIERRA = new THREE.BoxGeometry(1, 4, 1);
const GEO_GEMA = new THREE.OctahedronGeometry(0.28);


/* =====================================================================
   5. MODELOS 3D
   Personajes hechos juntando primitivas dentro de un THREE.Group.
   ===================================================================== */

// Ayuda: crea una malla, la ubica y activa sombras
function pieza(geometria, material, x, y, z) {
    const malla = new THREE.Mesh(geometria, material);
    malla.position.set(x, y, z);
    malla.castShadow = true;
    return malla;
}

// ---------- Jugador: un vaquero ----------
// Piernas y brazos son GRUPOS con el origen en la cadera y en el hombro:
// al rotarlos giran desde la articulación, como un péndulo.
// La cara mira hacia +Z (hacia la cámara).
function crearModeloJugador() {
    const grupo = new THREE.Group();   // el origen del grupo está en los PIES
    const matPiel = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
    const matCamisa = new THREE.MeshLambertMaterial({ color: 0xc0392b });
    const matChaleco = new THREE.MeshLambertMaterial({ color: 0x7a5232 });
    const matJean = new THREE.MeshLambertMaterial({ color: 0x3a5a8c });
    const matCuero = new THREE.MeshLambertMaterial({ color: 0x3e2a1e });     // botas, cinturón, bigote
    const matSombrero = new THREE.MeshLambertMaterial({ color: 0xc08a50 });
    const matPanuelo = new THREE.MeshLambertMaterial({ color: 0xffd23f });
    const matNegro = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });      // Basic = no le afecta la luz

    // Pierna: jean + bota (la punta de la bota sale un poco hacia adelante)
    function crearPierna(x) {
        const pierna = new THREE.Group();
        pierna.position.set(x, 0.3, 0);                  // articulación: la cadera
        pierna.add(pieza(new THREE.BoxGeometry(0.15, 0.22, 0.17), matJean, 0, -0.11, 0));
        pierna.add(pieza(new THREE.BoxGeometry(0.17, 0.1, 0.25), matCuero, 0, -0.25, 0.03));
        return pierna;
    }
    // Brazo: manga + mano
    function crearBrazo(x) {
        const brazo = new THREE.Group();
        brazo.position.set(x, 0.6, 0);                   // articulación: el hombro
        brazo.add(pieza(new THREE.BoxGeometry(0.11, 0.24, 0.13), matCamisa, 0, -0.11, 0));
        brazo.add(pieza(new THREE.SphereGeometry(0.06, 10, 8), matPiel, 0, -0.26, 0));
        return brazo;
    }
    const piernaIzq = crearPierna(-0.1);
    const piernaDer = crearPierna(0.1);
    const brazoIzq = crearBrazo(-0.27);
    const brazoDer = crearBrazo(0.27);

    // Torso: chaleco abierto que deja ver la camisa al centro
    const chaleco = pieza(new THREE.BoxGeometry(0.42, 0.28, 0.26), matChaleco, 0, 0.47, 0);
    const camisa = pieza(new THREE.BoxGeometry(0.12, 0.28, 0.02), matCamisa, 0, 0.47, 0.135);
    const cinturon = pieza(new THREE.BoxGeometry(0.44, 0.06, 0.28), matCuero, 0, 0.33, 0);
    const hebilla = pieza(new THREE.BoxGeometry(0.1, 0.07, 0.02), MATERIALES.dorado, 0, 0.33, 0.145);
    const funda = pieza(new THREE.BoxGeometry(0.07, 0.15, 0.12), matCuero, 0.25, 0.2, 0);    // funda del revólver
    const culata = pieza(new THREE.BoxGeometry(0.05, 0.09, 0.05), matNegro, 0.25, 0.3, -0.04);

    // Pañuelo: un anillo en el cuello + un triángulo (cono de 3 lados) con la punta hacia abajo
    const panueloCuello = pieza(new THREE.CylinderGeometry(0.13, 0.15, 0.05, 12), matPanuelo, 0, 0.62, 0);
    const panueloPunta = pieza(new THREE.ConeGeometry(0.09, 0.12, 3), matPanuelo, 0, 0.56, 0.13);
    panueloPunta.rotation.x = Math.PI;

    // Cabeza: cara, ojos, nariz y bigote
    const cabeza = pieza(new THREE.BoxGeometry(0.3, 0.26, 0.28), matPiel, 0, 0.77, 0);
    const ojoIzq = pieza(new THREE.BoxGeometry(0.045, 0.06, 0.02), matNegro, -0.07, 0.8, 0.145);
    const ojoDer = pieza(new THREE.BoxGeometry(0.045, 0.06, 0.02), matNegro, 0.07, 0.8, 0.145);
    const nariz = pieza(new THREE.BoxGeometry(0.05, 0.06, 0.04), matPiel, 0, 0.75, 0.155);
    const bigote = pieza(new THREE.BoxGeometry(0.17, 0.035, 0.03), matCuero, 0, 0.71, 0.15);

    // Sombrero: ala ancha (cilindro muy bajo) + copa + cinta. Va inclinado hacia atrás.
    const sombrero = new THREE.Group();
    sombrero.position.set(0, 0.9, 0);
    sombrero.rotation.x = -0.12;
    const ala = pieza(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 20), matSombrero, 0, 0, 0);
    ala.scale.z = 0.85;
    const copa = pieza(new THREE.CylinderGeometry(0.14, 0.17, 0.17, 16), matSombrero, 0, 0.09, 0);
    const cinta = pieza(new THREE.CylinderGeometry(0.172, 0.175, 0.04, 16), matCuero, 0, 0.035, 0);
    sombrero.add(ala, copa, cinta);

    grupo.add(piernaIzq, piernaDer, brazoIzq, brazoDer, chaleco, camisa, cinturon, hebilla, funda, culata,
              panueloCuello, panueloPunta, cabeza, ojoIzq, ojoDer, nariz, bigote, sombrero);
    grupo.userData = { piernaIzq, piernaDer, brazoIzq, brazoDer };   // las guardamos para animarlas
    return grupo;
}

// ---------- Enemigo: un "blob" morado ----------
function crearModeloEnemigo() {
    const grupo = new THREE.Group();
    const matCuerpo = new THREE.MeshLambertMaterial({ color: 0x9b5de5 });
    const matBlanco = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const matNegro = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const cuerpo = pieza(new THREE.SphereGeometry(0.42, 20, 16), matCuerpo, 0, 0.32, 0);
    cuerpo.scale.set(1, 0.78, 0.9);     // achatamos la esfera
    const ojoIzq = pieza(new THREE.SphereGeometry(0.1, 10, 10), matBlanco, -0.14, 0.42, 0.3);
    const ojoDer = pieza(new THREE.SphereGeometry(0.1, 10, 10), matBlanco, 0.14, 0.42, 0.3);
    const pupIzq = pieza(new THREE.SphereGeometry(0.05, 8, 8), matNegro, -0.14, 0.42, 0.39);
    const pupDer = pieza(new THREE.SphereGeometry(0.05, 8, 8), matNegro, 0.14, 0.42, 0.39);
    const cejaIzq = pieza(new THREE.BoxGeometry(0.16, 0.04, 0.04), matNegro, -0.14, 0.55, 0.33);
    cejaIzq.rotation.z = -0.4;
    const cejaDer = pieza(new THREE.BoxGeometry(0.16, 0.04, 0.04), matNegro, 0.14, 0.55, 0.33);
    cejaDer.rotation.z = 0.4;

    grupo.add(cuerpo, ojoIzq, ojoDer, pupIzq, pupDer, cejaIzq, cejaDer);
    return grupo;
}

// ---------- Bandera (meta) y punto de control ----------
function crearBandera(alto, colorTela) {
    const grupo = new THREE.Group();
    const matPoste = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const matTela = new THREE.MeshLambertMaterial({ color: colorTela, side: THREE.DoubleSide });
    grupo.add(pieza(new THREE.CylinderGeometry(0.06, 0.06, alto), matPoste, 0, alto / 2, 0));
    grupo.add(pieza(new THREE.SphereGeometry(0.14, 12, 12), MATERIALES.dorado, 0, alto + 0.1, 0));
    const tela = pieza(new THREE.BoxGeometry(0.9, 0.6, 0.04), matTela, -0.48, alto - 0.4, 0);
    grupo.add(tela);
    grupo.userData.tela = tela;
    return grupo;
}


/* =====================================================================
   6. CONSTRUCCIÓN DEL NIVEL
   Recorremos el mapa de texto y creamos un objeto por cada carácter.
   Los bloques sólidos se guardan en un Map con la clave "x,y" para
   encontrarlos rápido al calcular colisiones.
   IMPORTANTE: construirNivel() se llama UNA vez al iniciar la partida,
   nunca dentro de animate(). Si se llamara en cada cuadro, crearíamos
   cientos de mallas 60 veces por segundo y el juego se volvería lento.
   ===================================================================== */
let grupoNivel = null,
    bloques = new Map(),             // "x,y" -> { x, y, tipo, malla, rebote }
    gemas = [],
    enemigos = [],
    particulas = [],
    posicionInicial = { x: 2.5, y: 1 },
    puntoControl = null,             // { x, y, bandera, activo }
    banderaMeta = null;              // { x, bandera }

const clave = (x, y) => x + "," + y;

function construirNivel() {
    // Eliminar el grupo de nivel anterior
    if (grupoNivel) scene.remove(grupoNivel);

    grupoNivel = new THREE.Group();
    scene.add(grupoNivel);

    bloques = new Map();
    gemas = [];
    enemigos = [];
    particulas = [];
    puntoControl = null;
    banderaMeta = null;

    const alto = MAPA_NIVEL.length;
    MAPA_NIVEL.forEach((fila, y) => {
        // Invertir el eje Y: la fila 0 del arreglo es la de ARRIBA del nivel
        const yMundo = alto - 1 - y;

        for (let index = 0; index < fila.length; index++) {
            const element = fila[index];

            if (SOLIDOS.has(element)) {
                crearBloque(index, yMundo, element);         // bloque sólido
            } else if (element === "o") {
                crearGema(index, yMundo);
            } else if (element === "E") {
                crearEnemigo(index, yMundo);
            } else if (element === "P") {
                posicionInicial = { x: index + 0.5, y: yMundo };
            } else if (element === "K") {
                const bandera = crearBandera(2, 0x9e9e9e);   // gris hasta que se active
                bandera.position.set(index + 0.5, yMundo, 0);
                grupoNivel.add(bandera);
                puntoControl = { x: index + 0.5, y: yMundo, bandera, activo: false };
            } else if (element === "F") {
                const bandera = crearBandera(6, 0xff595e);
                bandera.position.set(index + 0.5, yMundo, 0);
                grupoNivel.add(bandera);
                banderaMeta = { x: index + 0.5, bandera };
            }
        }
    });
}

function crearBloque(x, y, tipo) {
    // Seleccionar el material que se le va a colocar al bloque según su tipo.
    // Los que se rompen y desaparecen (B) llevan la imagen "?" de sorpresa;
    // los que sueltan una gema (G) se ven como ladrillo.
    const material = {
        "#": MATERIALES.suelo,
        "B": MATERIALES.sorpresa,
        "G": MATERIALES.ladrillo,
        "S": MATERIALES.piedra,
        "C": MATERIALES.columna,
        "U": MATERIALES.usado,
    }[tipo];

    const malla = new THREE.Mesh(GEO_BLOQUE, material);
    // +0.5 porque el cubo se ubica desde su centro, pero la casilla va de x a x+1
    malla.position.set(x + 0.5, y + 0.5, 0);
    malla.castShadow = true;
    malla.receiveShadow = true;
    grupoNivel.add(malla);
    bloques.set(clave(x, y), { x, y, tipo, malla, rebote: 0 });

    // Debajo de cada bloque de suelo agregamos tierra (solo decorativa, sin colisión)
    if (tipo === "#") {
        const tierra = new THREE.Mesh(GEO_TIERRA, MATERIALES.tierra);
        tierra.position.set(x + 0.5, y - 2, 0);
        tierra.receiveShadow = true;
        grupoNivel.add(tierra);
    }
}

function crearGema(x, y) {
    const malla = new THREE.Mesh(GEO_GEMA, MATERIALES.gema);
    malla.position.set(x + 0.5, y + 0.5, 0);
    malla.castShadow = true;
    grupoNivel.add(malla);
    gemas.push({ x, y, malla, recogida: false });
}

function crearEnemigo(x, y) {
    const malla = crearModeloEnemigo();
    grupoNivel.add(malla);
    enemigos.push({
        x: x + 0.5, y: y,          // x = centro, y = base (pies)
        vx: 0, vy: 0,
        ancho: 0.8, alto: 0.7,     // caja de colisión
        direccion: -1,             // empieza caminando a la izquierda
        vivo: true,
        tiempoMuerto: 0,
        malla,
    });
}

/* =====================================================================
   7. ENTRADA DEL TECLADO
   Guardamos qué teclas están presionadas; en cada cuadro preguntamos.
   ===================================================================== */
const teclas = {};

window.addEventListener('keydown', (e) => {
    teclas[e.code] = true;

    // Evita que la página haga scroll con espacio o flechas
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();

    // "Buffer" de salto: recordamos que el jugador quiso saltar
    if (!e.repeat && esTeclaSalto(e.code) && estado === 'jugando') {
        jugador.bufferSalto = CONFIG.BUFFER_SALTO;
    }

    if (e.code === 'KeyP') alternarPausa();
    if (e.code === 'KeyR' && estado !== 'inicio') iniciarJuego();
    if (e.code === 'KeyM') alternarSilencio();   // sección 17
});

window.addEventListener('keyup', (e) => { teclas[e.code] = false; });

const esTeclaSalto = (code) => code === 'Space' || code === 'ArrowUp' || code === 'KeyW';
const teclaIzquierda = () => teclas['ArrowLeft'] || teclas['KeyA'];
const teclaDerecha = () => teclas['ArrowRight'] || teclas['KeyD'];
const teclaSaltoPresionada = () => teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'];
const teclaCorrer = () => teclas['ShiftLeft'] || teclas['ShiftRight'];


/* =====================================================================
   8. FÍSICA Y COLISIONES (AABB contra la grilla)
   Movemos primero en X y resolvemos choques, y LUEGO en Y.
   Separar los ejes evita que el personaje se "pegue" en las esquinas.
   Toda entidad tiene: x (centro), y (pies), ancho, alto, vx, vy.
   ===================================================================== */
function obtenerBloque(tx, ty) {
    return bloques.get(clave(tx, ty)) || null;
}

// Devuelve los bloques sólidos que se cruzan con la caja de la entidad
function bloquesQueToca(ent) {
    const resultado = [];
    const izquierda = Math.floor(ent.x - ent.ancho / 2);
    const derecha = Math.floor(ent.x + ent.ancho / 2 - 0.001);
    const abajo = Math.floor(ent.y);
    const arriba = Math.floor(ent.y + ent.alto - 0.001);

    for (let tx = izquierda; tx <= derecha; tx++) {
        for (let ty = abajo; ty <= arriba; ty++) {
            const b = obtenerBloque(tx, ty);
            if (b) resultado.push(b);
        }
    }
    return resultado;
}

// Mueve una entidad y la saca de los bloques con los que choque.
// alGolpearTecho: función opcional (callback) si choca con la cabeza.
function moverEntidad(ent, dt, alGolpearTecho) {
    ent.chocoPared = false;

    // --- Eje X ---
    ent.x += ent.vx * dt;
    let choques = bloquesQueToca(ent);
    if (choques.length > 0) {
        if (ent.vx > 0) {
            ent.x = Math.min(...choques.map(b => b.x)) - ent.ancho / 2 - 0.001;
        } else if (ent.vx < 0) {
            ent.x = Math.max(...choques.map(b => b.x)) + 1 + ent.ancho / 2 + 0.001;
        }
        ent.vx = 0;
        ent.chocoPared = true;
    }

    // --- Eje Y ---
    ent.y += ent.vy * dt;
    ent.enSuelo = false;
    choques = bloquesQueToca(ent);
    if (choques.length > 0) {
        if (ent.vy < 0) {
            // Cayendo: aterriza encima del bloque
            ent.y = Math.max(...choques.map(b => b.y)) + 1;
            ent.enSuelo = true;
        } else if (ent.vy > 0) {
            // Subiendo: se golpea la cabeza
            ent.y = Math.min(...choques.map(b => b.y)) - ent.alto - 0.001;
            if (alGolpearTecho) alGolpearTecho(choques);
        }
        ent.vy = 0;
    }
}

// ¿Se superponen dos cajas? (prueba AABB)
function seSuperponen(a, b) {
    return Math.abs(a.x - b.x) < (a.ancho + b.ancho) / 2 &&
           a.y < b.y + b.alto &&
           a.y + a.alto > b.y;
}


/* =====================================================================
   9. BLOQUES: ROMPER BLOQUES SORPRESA Y LADRILLOS CON GEMA
   ===================================================================== */
function golpearBloque(listaBloques) {
    // Si la cabeza toca dos bloques, golpeamos el más cercano al centro del jugador
    const bloque = listaBloques.reduce((mejor, b) =>
        Math.abs(b.x + 0.5 - jugador.x) < Math.abs(mejor.x + 0.5 - jugador.x) ? b : mejor);

    if (bloque.tipo === 'B') {
        // Bloque sorpresa "?": se rompe y desaparece
        destruirBloque(bloque);
    } else if (bloque.tipo === 'G') {
        // Ladrillo con gema: suelta una gema y queda "usado" (se oscurece)
        bloque.tipo = 'U';
        bloque.malla.material = MATERIALES.usado;
        bloque.rebote = 0.2;
        gemaQueSalta(bloque.x, bloque.y + 1);
        sumarGema(100);
    } else {
        bloque.rebote = 0.1;
        reproducir('golpe');
    }

    // Si había un enemigo parado sobre el bloque golpeado, ¡también lo derrota!
    enemigos.forEach(en => {
        if (en.vivo && Math.floor(en.x) === bloque.x && Math.abs(en.y - (bloque.y + 1)) < 0.1) {
            derrotarEnemigo(en, 100);
        }
    });
}

function destruirBloque(bloque) {
    grupoNivel.remove(bloque.malla);                 // lo quitamos de la escena
    bloques.delete(clave(bloque.x, bloque.y));       // y del mapa de colisiones
    crearParticulas(bloque.x + 0.5, bloque.y + 0.5, MATERIALES.sorpresa, 8);
    puntos += 50;
    reproducir('romper');
}

// Gema que sale de un bloque sorpresa (sube, gira y desaparece)
function gemaQueSalta(x, y) {
    const malla = new THREE.Mesh(GEO_GEMA, MATERIALES.gema);
    malla.position.set(x + 0.5, y + 0.3, 0);
    grupoNivel.add(malla);
    particulas.push({ malla, vx: 0, vy: 8, vz: 0, vida: 0.5, gira: 15, gravedad: -20 });
}

function sumarGema(puntosExtra) {
    gemasRecogidas++;
    puntos += puntosExtra;
    reproducir('gema');
    // Cada 20 gemas, ¡una vida extra!
    if (gemasRecogidas % 20 === 0) {
        vidas++;
        mostrarAviso('¡VIDA EXTRA!');
        reproducir('vidaExtra');
    }
}


/* =====================================================================
   10. JUGADOR
   ===================================================================== */
const jugador = {
    x: 0, y: 0, vx: 0, vy: 0,
    ancho: 0.7, alto: 0.9,
    enSuelo: false,
    mirando: 1,               // 1 = derecha, -1 = izquierda
    tiempoCoyote: 0,
    bufferSalto: 0,
    saltando: false,
    invulnerable: 0,
    tiempoAnimacion: 0,
    malla: crearModeloJugador(),
};
scene.add(jugador.malla);

function reaparecerJugador() {
    // Si activamos el punto de control, reaparecemos ahí
    const inicio = (puntoControl && puntoControl.activo) ? puntoControl : posicionInicial;
    jugador.x = inicio.x;
    jugador.y = inicio.y;
    jugador.vx = 0;
    jugador.vy = 0;
    jugador.mirando = 1;
    jugador.invulnerable = CONFIG.INVULNERABLE;
    jugador.malla.rotation.set(0, 0, 0);
    jugador.malla.visible = true;
}

function actualizarJugador(dt) {
    const j = jugador;

    // --- Movimiento horizontal con aceleración y fricción ---
    let direccion = 0;
    if (teclaIzquierda()) direccion -= 1;
    if (teclaDerecha()) direccion += 1;
    const velocidadMaxima = teclaCorrer() ? CONFIG.VEL_CORRER : CONFIG.VEL_CAMINAR;

    if (direccion !== 0) {
        j.vx += direccion * CONFIG.ACELERACION * dt;
        j.vx = Math.max(-velocidadMaxima, Math.min(velocidadMaxima, j.vx)); // limitar (clamp)
        j.mirando = direccion;
    } else {
        // Fricción: reducimos la velocidad poco a poco hasta 0
        const freno = CONFIG.FRICCION * dt;
        j.vx = Math.abs(j.vx) <= freno ? 0 : j.vx - Math.sign(j.vx) * freno;
    }

    // --- Salto (con coyote time y buffer) ---
    j.tiempoCoyote = j.enSuelo ? CONFIG.TIEMPO_COYOTE : j.tiempoCoyote - dt;
    j.bufferSalto -= dt;

    if (j.bufferSalto > 0 && j.tiempoCoyote > 0) {
        j.vy = CONFIG.FUERZA_SALTO;
        j.bufferSalto = 0;
        j.tiempoCoyote = 0;
        j.saltando = true;
        reproducir('saltar');
    }

    // Salto variable: si sueltas el botón mientras subes, el salto se corta
    if (j.saltando && !teclaSaltoPresionada() && j.vy > 0) {
        j.vy *= CONFIG.CORTE_SALTO;
        j.saltando = false;
    }
    if (j.vy <= 0) j.saltando = false;

    // --- Gravedad ---
    j.vy += CONFIG.GRAVEDAD * dt;
    j.vy = Math.max(j.vy, CONFIG.VEL_MAX_CAIDA);

    // --- Mover y resolver colisiones ---
    moverEntidad(j, dt, golpearBloque);

    // No dejar que salga por el borde izquierdo del mundo
    if (j.x < j.ancho / 2) { j.x = j.ancho / 2; j.vx = 0; }

    // --- ¿Se cayó al vacío? ---
    if (j.y < CONFIG.LIMITE_CAIDA) {
        perderVida(false);
        return;
    }

    // --- Recoger gemas ---
    gemas.forEach(g => {
        if (!g.recogida && seSuperponen(j, { x: g.x + 0.5, y: g.y + 0.15, ancho: 0.6, alto: 0.7 })) {
            g.recogida = true;
            grupoNivel.remove(g.malla);
            sumarGema(100);
        }
    });

    // --- Punto de control (K): se activa al pasar por él ---
    if (puntoControl && !puntoControl.activo && j.x >= puntoControl.x) {
        puntoControl.activo = true;
        puntoControl.bandera.userData.tela.material.color.set(0x4caf50); // se pone verde
        mostrarAviso('¡PUNTO DE CONTROL!');
        reproducir('puntoControl');
    }

    // --- Meta (F) ---
    if (banderaMeta && j.x >= banderaMeta.x - 0.2) {
        ganarNivel();
    }

    if (j.invulnerable > 0) j.invulnerable -= dt;
    actualizarModeloJugador(dt);
}

// Sincroniza el modelo 3D con los datos del jugador y lo anima
function actualizarModeloJugador(dt) {
    const j = jugador;
    const m = j.malla;
    m.position.set(j.x, j.y, 0);

    // Girar suavemente hacia donde mira (sin llegar a 90° para que se vea la cara)
    const anguloObjetivo = j.mirando * 0.9;
    m.rotation.y += (anguloObjetivo - m.rotation.y) * Math.min(1, 12 * dt);

    // Animación de caminar: piernas y brazos se balancean con una función seno.
    // Cada brazo va al revés que la pierna de su lado, como al caminar de verdad.
    const { piernaIzq, piernaDer, brazoIzq, brazoDer } = m.userData;
    let balanceo = 0, abrirBrazos = 0;
    if (!j.enSuelo) {
        balanceo = 0.6;          // en el aire: una pierna adelante y otra atrás
        abrirBrazos = 0.8;       // y los brazos abiertos hacia los lados
    } else if (Math.abs(j.vx) > 0.5) {
        j.tiempoAnimacion += dt * Math.abs(j.vx) * 2.2;
        balanceo = Math.sin(j.tiempoAnimacion) * 0.8;
    }
    // Cada ángulo se acerca a su objetivo poco a poco (lerp) para que la pose no "salte"
    const suave = Math.min(1, 18 * dt);
    piernaIzq.rotation.x += (balanceo - piernaIzq.rotation.x) * suave;
    piernaDer.rotation.x += (-balanceo - piernaDer.rotation.x) * suave;
    brazoIzq.rotation.x += (-balanceo - brazoIzq.rotation.x) * suave;
    brazoDer.rotation.x += (balanceo - brazoDer.rotation.x) * suave;
    brazoIzq.rotation.z += (-abrirBrazos - brazoIzq.rotation.z) * suave;
    brazoDer.rotation.z += (abrirBrazos - brazoDer.rotation.z) * suave;

    // "Squash & stretch": se estira al subir y se aplasta al caer
    const estirar = j.enSuelo ? 1 : 1 + Math.max(-0.15, Math.min(0.15, j.vy * 0.015));
    m.scale.set(2 - estirar, estirar, 2 - estirar);

    // Parpadeo mientras es invulnerable
    m.visible = j.invulnerable > 0 ? Math.floor(j.invulnerable * 12) % 2 === 0 : true;
}

// Se llama cuando el jugador recibe daño o se cae
function perderVida(conAnimacion) {
    if (estado !== 'jugando') return;
    vidas--;
    estado = 'muriendo';
    tiempoMuerte = 1.4;
    jugador.malla.visible = true;
    // Animación clásica: sale disparado hacia arriba y cae fuera de la pantalla
    jugador.vy = conAnimacion ? 12 : 0;
    jugador.vx = 0;
    reproducir('perderVida');
    bajarMusica(true);          // la música baja para que se escuche el efecto
}

function actualizarMuerte(dt) {
    tiempoMuerte -= dt;
    jugador.vy += CONFIG.GRAVEDAD * dt;
    jugador.y += jugador.vy * dt;               // sin colisiones: atraviesa el suelo
    jugador.malla.position.set(jugador.x, jugador.y, 0);
    jugador.malla.rotation.z += dt * 8;          // da vueltas

    if (tiempoMuerte <= 0) {
        if (vidas <= 0) {
            terminarJuego(false);
        } else {
            reaparecerJugador();
            tiempoRestante = CONFIG.TIEMPO_NIVEL;
            estado = 'jugando';
            bajarMusica(false);
        }
    }
}


/* =====================================================================
   11. ENEMIGOS
   Caminan de lado a lado; dan media vuelta en paredes y bordes.
   Si el jugador les cae encima, mueren.
   ===================================================================== */
function actualizarEnemigos(dt, tiempo) {
    enemigos.forEach(en => {
        // Enemigo aplastado: esperamos un momento y lo quitamos
        if (!en.vivo) {
            en.tiempoMuerto -= dt;
            if (en.tiempoMuerto <= 0 && en.malla.parent) grupoNivel.remove(en.malla);
            return;
        }

        // Solo se activan cuando están cerca del jugador
        if (Math.abs(en.x - jugador.x) > 18) return;

        en.vx = en.direccion * CONFIG.VEL_ENEMIGO;
        en.vy += CONFIG.GRAVEDAD * dt;
        moverEntidad(en, dt);

        // Media vuelta al chocar con una pared
        if (en.chocoPared) en.direccion *= -1;

        // Media vuelta si adelante no hay suelo (no se cae de las plataformas)
        if (en.enSuelo) {
            const pieDelantero = Math.floor(en.x + en.direccion * (en.ancho / 2 + 0.05));
            if (!obtenerBloque(pieDelantero, Math.floor(en.y - 0.1))) en.direccion *= -1;
        }

        if (en.y < CONFIG.LIMITE_CAIDA) { en.vivo = false; en.tiempoMuerto = 0; }

        // Animación: rebota un poquito y mira hacia donde va
        en.malla.position.set(en.x, en.y, 0);
        en.malla.scale.y = 1 + Math.sin(tiempo * 12) * 0.08;
        en.malla.rotation.y = en.direccion * 0.6;

        // --- Colisión con el jugador ---
        if (estado === 'jugando' && seSuperponen(jugador, en)) {
            const cayendoEncima = jugador.vy < 0 && jugador.y > en.y + en.alto * 0.4;
            if (cayendoEncima) {
                derrotarEnemigo(en, 200);
                jugador.vy = CONFIG.FUERZA_SALTO * 0.65;   // rebote al pisarlo
                jugador.saltando = teclaSaltoPresionada();
            } else if (jugador.invulnerable <= 0) {
                perderVida(true);
            }
        }
    });
}

function derrotarEnemigo(en, puntosGanados) {
    en.vivo = false;
    en.tiempoMuerto = 0.5;
    en.malla.scale.set(1.2, 0.25, 1.2);   // queda aplastado
    puntos += puntosGanados;
    reproducir('aplastar');
}


/* =====================================================================
   12. PARTÍCULAS Y ANIMACIONES DEL NIVEL
   Los pedacitos usan el MISMO material del bloque sorpresa: así llevan
   su textura de imagen y parecen trozos reales del bloque.
   ===================================================================== */
const GEO_PEDAZO = new THREE.BoxGeometry(0.25, 0.25, 0.25);

function crearParticulas(x, y, material, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        const malla = new THREE.Mesh(GEO_PEDAZO, material);
        malla.position.set(x, y, 0);
        grupoNivel.add(malla);
        particulas.push({
            malla,
            vx: (Math.random() - 0.5) * 6,
            vy: 5 + Math.random() * 5,
            vz: (Math.random() - 0.5) * 6,
            vida: 1.2,
            gira: 10,
            gravedad: CONFIG.GRAVEDAD,
        });
    }
}

function actualizarParticulas(dt) {
    // Recorremos al revés para poder borrar del arreglo sin saltarnos elementos
    for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.vy += p.gravedad * dt;
        p.malla.position.x += p.vx * dt;
        p.malla.position.y += p.vy * dt;
        p.malla.position.z += p.vz * dt;
        p.malla.rotation.x += p.gira * dt;
        p.malla.rotation.y += p.gira * dt;
        p.vida -= dt;
        if (p.vida <= 0) {
            grupoNivel.remove(p.malla);
            particulas.splice(i, 1);
        }
    }
}

// Bloques que "rebotan" al golpearlos, gemas que giran y bandera que ondea
function animarNivel(dt, tiempo) {
    bloques.forEach(b => {
        if (b.rebote > 0) {
            b.rebote -= dt;
            b.malla.position.y = b.y + 0.5 + Math.sin(Math.max(0, b.rebote) * 15) * 0.15;
        }
    });
    gemas.forEach(g => {
        if (!g.recogida) {
            g.malla.rotation.y = tiempo * 2;
            g.malla.position.y = g.y + 0.5 + Math.sin(tiempo * 3 + g.x) * 0.08;
        }
    });
    if (banderaMeta) banderaMeta.bandera.userData.tela.rotation.y = Math.sin(tiempo * 3) * 0.25;
}


/* =====================================================================
   13. CÁMARA QUE SIGUE AL JUGADOR
   Interpolación (lerp): en cada cuadro la cámara recorre un porcentaje
   de la distancia hacia su objetivo → movimiento suave.
   ===================================================================== */
function actualizarCamara(dt) {
    const suavizado = Math.min(1, 5 * dt);
    const objetivoX = Math.max(8, jugador.x + 2);         // un poco adelante del jugador
    const objetivoY = Math.max(4.5, jugador.y + 3);

    camera.position.x += (objetivoX - camera.position.x) * suavizado;
    camera.position.y += (objetivoY - camera.position.y) * suavizado;
    camera.position.z = 14;
    camera.lookAt(camera.position.x, camera.position.y - 2, 0);

    moverSol();
}

// La luz del sol sigue a la cámara para que siempre haya sombras cerca
function moverSol() {
    luzSol.position.set(camera.position.x - 6, 18, 12);
    luzSol.target.position.set(camera.position.x, 0, 0);
}


/* =====================================================================
   14. INTERFAZ: HUD Y PANTALLAS
   Necesita estos id en index.html: hud-vidas, hud-gemas, hud-puntos,
   hud-tiempo, aviso, pantalla-inicio, pantalla-pausa, pantalla-fin,
   fin-titulo, fin-detalle, btn-jugar, btn-reiniciar.
   ===================================================================== */
const ui = {
    vidas: document.getElementById('hud-vidas'),
    gemas: document.getElementById('hud-gemas'),
    puntos: document.getElementById('hud-puntos'),
    tiempo: document.getElementById('hud-tiempo'),
    aviso: document.getElementById('aviso'),
    inicio: document.getElementById('pantalla-inicio'),
    pausa: document.getElementById('pantalla-pausa'),
    fin: document.getElementById('pantalla-fin'),
    finTitulo: document.getElementById('fin-titulo'),
    finDetalle: document.getElementById('fin-detalle'),
};

function actualizarHUD() {
    ui.vidas.textContent = vidas;   // también se puede probar: '❤'.repeat(vidas)
    ui.gemas.textContent = gemasRecogidas;
    ui.puntos.textContent = String(puntos).padStart(6, '0');   // 000150
    ui.tiempo.textContent = Math.ceil(tiempoRestante);
}

let temporizadorAviso = null;
function mostrarAviso(texto) {
    ui.aviso.textContent = texto;
    ui.aviso.classList.remove('oculto');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => ui.aviso.classList.add('oculto'), 1500);
}

// El botón de jugar empieza deshabilitado hasta que carguen las texturas (ver sección 4)
const botonJugar = document.getElementById('btn-jugar');
botonJugar.disabled = true;
botonJugar.addEventListener('click', iniciarJuego);
document.getElementById('btn-reiniciar').addEventListener('click', iniciarJuego);


/* =====================================================================
   15. ESTADOS DEL JUEGO Y BUCLE PRINCIPAL
   'inicio' -> 'jugando' <-> 'pausa'
              'jugando' -> 'muriendo' -> 'jugando' o 'gameover'
              'jugando' -> 'victoria'
   ===================================================================== */
let estado = 'inicio';
let vidas = CONFIG.VIDAS_INICIALES,
    puntos = 0,
    gemasRecogidas = 0,
    tiempoRestante = CONFIG.TIEMPO_NIVEL,
    tiempoMuerte = 0;

function iniciarJuego() {
    vidas = CONFIG.VIDAS_INICIALES;
    puntos = 0;
    gemasRecogidas = 0;
    tiempoRestante = CONFIG.TIEMPO_NIVEL;

    construirNivel();          // ← UNA sola vez por partida
    reaparecerJugador();
    jugador.invulnerable = 0;
    camera.position.set(8, 4.5, 14);

    ui.inicio.classList.add('oculto');
    ui.fin.classList.add('oculto');
    ui.pausa.classList.add('oculto');
    estado = 'jugando';

    // Sonido (sección 17). iniciarJuego siempre viene de un clic o una tecla,
    // así que el navegador ya permite reproducir audio.
    iniciarAudio();
    actualizarPausaAudio();
    bajarMusica(false);
    tocarMusica('juego');
}

function alternarPausa() {
    if (estado === 'jugando') {
        estado = 'pausa';
        ui.pausa.classList.remove('oculto');
    } else if (estado === 'pausa') {
        estado = 'jugando';
        ui.pausa.classList.add('oculto');
    }
    actualizarPausaAudio();   // en pausa el audio se congela
}

function ganarNivel() {
    const bonus = Math.ceil(tiempoRestante) * 10;   // el tiempo sobrante da puntos
    puntos += bonus;
    terminarJuego(true, bonus);
}

function terminarJuego(gano, bonus = 0) {
    estado = gano ? 'victoria' : 'gameover';
    actualizarHUD();
    ui.finTitulo.textContent = gano ? '¡NIVEL COMPLETADO!' : 'GAME OVER';
    ui.finDetalle.innerHTML = gano
        ? `Puntos: ${puntos}<br>Gemas: ${gemasRecogidas}<br>Bono por tiempo: ${bonus}`
        : `Puntos: ${puntos}<br>Gemas: ${gemasRecogidas}`;
    setTimeout(() => ui.fin.classList.remove('oculto'), gano ? 800 : 200);

    // Fanfarria o melodía triste; al terminar vuelve la música tranquila del menú
    reproducir(gano ? 'ganar' : 'gameOver');
    bajarMusica(false);
    tocarMusica('menu', 3);
}

// ---------- Bucle principal ----------
// renderer.setAnimationLoop(animate) llama a animate ~60 veces por segundo
// (es la versión de Three.js de requestAnimationFrame) y le pasa la hora actual.
// dt (delta time) = segundos desde el cuadro anterior. Multiplicar las
// velocidades por dt hace que el juego vaya igual en PCs rápidos y lentos.
// THREE.Timer reemplaza a THREE.Clock (obsoleto). connect(document) evita un
// dt gigante al volver a la pestaña después de tenerla oculta.
const reloj = new THREE.Timer();
reloj.connect(document);

function animate(marcaDeTiempo) {
    reloj.update(marcaDeTiempo);
    const dt = Math.min(reloj.getDelta(), 1 / 30);   // limitamos dt para evitar "teletransportes"
    const tiempo = reloj.getElapsed();

    if (estado === 'jugando') {
        actualizarJugador(dt);
        actualizarEnemigos(dt, tiempo);
        tiempoRestante -= dt;
        if (tiempoRestante <= 0) { tiempoRestante = 0; perderVida(true); }
    } else if (estado === 'muriendo') {
        actualizarMuerte(dt);
    }

    if (estado !== 'pausa') {
        actualizarParticulas(dt);
        animarNivel(dt, tiempo);
    }

    if (estado !== 'inicio') {
        actualizarCamara(dt);
        actualizarHUD();
    } else {
        // En la pantalla de inicio la cámara recorre el nivel lentamente
        camera.position.set(10 + Math.sin(tiempo * 0.2) * 6, 5, 14);
        camera.lookAt(camera.position.x, 3, 0);
        moverSol();
    }

    // El fondo se acomoda DESPUÉS de mover la cámara: el parallax depende de ella
    actualizarDecoracion(estado === 'pausa' ? 0 : dt);

    renderer.render(scene, camera);
}


/* =====================================================================
   16. DECORACIÓN DE FONDO: DESIERTO AL ATARDECER
   Todo va en su PROPIO grupo (grupoDecoracion), separado de grupoNivel y
   del mapa "bloques" de la sección 6. Como la física solo revisa "bloques",
   la decoración NO tiene colisión: el jugador nunca la toca.

   COMPOSICIÓN POR CAPAS DE PROFUNDIDAD (eje Z). Cuanto más lejos está algo:
     - más pequeño se ve (perspectiva de la cámara),
     - más lo cubre la niebla (scene.fog) y se funde con el horizonte,
     - más despacio se mueve cuando avanza la cámara (parallax).

     Capa          Z              Elementos                  Parallax
     cercana       -2 a -14       suelo, cactus, rocas,       0    (fija)
                                  plantas rodadoras
     dunas         -18 a -30      dunas de arena              0.15
     mesetas       -40 a -55      mesetas de roca roja        0.35
     nubes         -55 a -75      nubes                       0.5
     montañas      -85 a -105     montañas                    0.6
     sol           -150           disco del sol               0.95
     cielo         (rodea a la cámara) cúpula con degradado   sigue a la cámara

   Parallax 0 = la capa queda quieta en el mundo; 1 = se mueve igual que la
   cámara (como si estuviera infinitamente lejos).
   ===================================================================== */
const grupoDecoracion = new THREE.Group();
scene.add(grupoDecoracion);

const capasFondo = [];
function crearCapa(parallax) {
    const capa = new THREE.Group();
    capa.userData.parallax = parallax;
    grupoDecoracion.add(capa);
    capasFondo.push(capa);
    return capa;
}
const capaCercana = crearCapa(0);
const capaDunas = crearCapa(0.15);
const capaMesetas = crearCapa(0.35);
const capaNubes = crearCapa(0.5);
const capaMontanas = crearCapa(0.6);
const capaSol = crearCapa(0.95);

// Números "al azar" con semilla: el desierto sale igual cada vez que se carga
let semilla = 7;
function aleatorio(min = 0, max = 1) {
    semilla = (semilla * 16807) % 2147483647;
    return min + (semilla / 2147483647) * (max - min);
}

// ---------- Cielo: cúpula con degradado ----------
// Una esfera gigante vista por DENTRO (BackSide) que siempre rodea a la cámara.
// Un ShaderMaterial la pinta según hacia dónde se mira: naranja en el
// horizonte, rosado más arriba y violeta en lo alto, con un resplandor
// alrededor del sol. No usa niebla (el propio cielo ES el color de la niebla).
const materialCielo = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,          // no tapa nada: todo lo demás se dibuja encima
    uniforms: {
        colorArriba: { value: new THREE.Color(COLOR_CIELO_ARRIBA) },
        colorMedio: { value: new THREE.Color(COLOR_CIELO_MEDIO) },
        colorHorizonte: { value: new THREE.Color(COLOR_HORIZONTE) },
        direccionSol: { value: new THREE.Vector3(0, 0, -1) },
    },
    vertexShader: `
        varying vec3 vDireccion;
        void main() {
            // La esfera está centrada en la cámara: cada vértice ES una dirección de la mirada
            vDireccion = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
    fragmentShader: `
        uniform vec3 colorArriba;
        uniform vec3 colorMedio;
        uniform vec3 colorHorizonte;
        uniform vec3 direccionSol;
        varying vec3 vDireccion;
        void main() {
            vec3 d = normalize(vDireccion);
            float altura = d.y;     // 0 = horizonte, 1 = justo arriba
            vec3 color = mix(colorHorizonte, colorMedio, smoothstep(0.0, 0.16, altura));
            color = mix(color, colorArriba, smoothstep(0.14, 0.42, altura));
            // Resplandor del sol: más fuerte cuanto más se mira hacia él
            float haciaSol = max(dot(d, direccionSol), 0.0);
            color += vec3(1.0, 0.55, 0.25) * (pow(haciaSol, 12.0) * 0.35 + pow(haciaSol, 90.0) * 0.5);
            gl_FragColor = vec4(color, 1.0);
            #include <colorspace_fragment>
        }`,
});
const cielo = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), materialCielo);
cielo.renderOrder = -1;         // se dibuja primero, de fondo
cielo.frustumCulled = false;
grupoDecoracion.add(cielo);

// ---------- Sol ----------
// MeshBasicMaterial con fog: false → brilla igual aunque esté muy lejos
const sol = new THREE.Mesh(new THREE.CircleGeometry(9, 40),
    new THREE.MeshBasicMaterial({ color: 0xffe7a8, fog: false }));
sol.position.set(14, 13, -150);
capaSol.add(sol);

// ---------- Materiales y geometrías compartidas ----------
// flatShading: cada cara se ilumina plana → aspecto "low poly" de roca tallada
const matArena = new THREE.MeshLambertMaterial({ color: 0xdb955c });
const matArenaPared = new THREE.MeshLambertMaterial({ color: 0xa8653f });   // paredes: más oscuras, dan volumen
const matDuna = new THREE.MeshLambertMaterial({ color: 0xe9a868 });
const matCactus = new THREE.MeshLambertMaterial({ color: 0x4f7f3a });
const matRoca = new THREE.MeshLambertMaterial({ color: 0x9a6248, flatShading: true });
const matMeseta = new THREE.MeshLambertMaterial({ color: 0xb5583a, flatShading: true });
const matMesetaCima = new THREE.MeshLambertMaterial({ color: 0x8a3c28, flatShading: true });
const matMontanas = [
    new THREE.MeshLambertMaterial({ color: 0x8c5a7c, flatShading: true }),
    new THREE.MeshLambertMaterial({ color: 0x6f4a73, flatShading: true }),
];
const matNube = new THREE.MeshLambertMaterial({ color: 0xffc4b0, emissive: 0x6a3550 });
const matRodadora = new THREE.MeshLambertMaterial({ color: 0xa47c48, wireframe: true });

const GEO_TRONCO = new THREE.CylinderGeometry(0.3, 0.34, 1, 10);   // alto 1: se estira con scale.y
const GEO_BRAZO = new THREE.CylinderGeometry(0.15, 0.15, 1, 8);
const GEO_BOLITA = new THREE.SphereGeometry(1, 10, 8);              // puntas redondas (se escala)
const GEO_ROCA = new THREE.DodecahedronGeometry(1, 0);
const GEO_DUNA = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);   // media esfera
const GEO_NUBE = new THREE.SphereGeometry(1, 14, 10);

// Ayuda: malla escalada (las geometrías compartidas miden 1 y se estiran)
function piezaEscalada(geometria, material, x, y, z, sx, sy, sz) {
    const malla = pieza(geometria, material, x, y, z);
    malla.scale.set(sx, sy, sz);
    return malla;
}

// ---------- Cactus (saguaro): tronco + 1 o 2 brazos en forma de L ----------
function crearCactus(alto) {
    const grupo = new THREE.Group();        // origen en la base
    grupo.add(piezaEscalada(GEO_TRONCO, matCactus, 0, alto / 2, 0, 1, alto, 1));
    grupo.add(piezaEscalada(GEO_BOLITA, matCactus, 0, alto, 0, 0.3, 0.3, 0.3));
    const lados = aleatorio() < 0.6 ? [-1, 1] : [aleatorio() < 0.5 ? -1 : 1];
    lados.forEach(lado => {
        const altura = alto * aleatorio(0.35, 0.6);
        const largo = aleatorio(0.5, 1.1);
        const horizontal = piezaEscalada(GEO_BRAZO, matCactus, lado * 0.45, altura, 0, 1, 0.5, 1);
        horizontal.rotation.z = Math.PI / 2;
        grupo.add(horizontal,
            piezaEscalada(GEO_BOLITA, matCactus, lado * 0.7, altura, 0, 0.15, 0.15, 0.15),   // codo
            piezaEscalada(GEO_BRAZO, matCactus, lado * 0.7, altura + largo / 2, 0, 1, largo, 1),
            piezaEscalada(GEO_BOLITA, matCactus, lado * 0.7, altura + largo, 0, 0.15, 0.15, 0.15));
    });
    return grupo;
}

// ---------- Plantas rodadoras: esferas de alambre que ruedan con el viento ----------
const rodadoras = [];
const RADIO_RODADORA = 0.55;
function crearRodadora(x, z) {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(new THREE.IcosahedronGeometry(RADIO_RODADORA, 1), matRodadora));
    const interior = new THREE.Mesh(new THREE.IcosahedronGeometry(RADIO_RODADORA * 0.8, 0), matRodadora);
    interior.rotation.set(0.6, 0.3, 0);     // girada para que se vea más enredada
    grupo.add(interior);
    grupo.position.set(x, -1 + RADIO_RODADORA, z);
    capaCercana.add(grupo);
    rodadoras.push({ malla: grupo, velocidad: aleatorio(2.2, 3.4), fase: aleatorio(0, 6) });
}

// ---------- Nubes: varias esferas achatadas juntas ----------
const nubes = [];
function crearNube(x, y, z) {
    const grupo = new THREE.Group();
    const cantidad = 3 + Math.floor(aleatorio(0, 3));
    for (let i = 0; i < cantidad; i++) {
        const r = aleatorio(1.3, 2.3);
        grupo.add(piezaEscalada(GEO_NUBE, matNube,
            (i - (cantidad - 1) / 2) * 2 + aleatorio(-0.4, 0.4), aleatorio(-0.3, 0.5), 0,
            r * 1.5, r * 0.6, r));
    }
    grupo.position.set(x, y, z);
    grupo.userData.velocidad = aleatorio(0.4, 1.0);
    capaNubes.add(grupo);
    nubes.push(grupo);
}

// ---------- Construir todo el desierto (UNA sola vez, en el arranque) ----------
// Las capas que se mueven con la cámara (parallax) necesitan cubrir un rango
// de X más amplio que el nivel, para que nunca se vea su final.
function construirDecoracion() {
    // Suelo del desierto: una caja enorme de arena. Su borde delantero está en
    // z = -2 (detrás de la franja jugable) y su cara de arriba en y = -1: el camino
    // del nivel queda más alto, como una meseta. Por los huecos se ve la pared de arena.
    // Caras de la caja: [+X, -X, +Y (arriba), -Y, +Z (frente), -Z]
    const suelo = new THREE.Mesh(new THREE.BoxGeometry(700, 30, 200),
        [matArenaPared, matArenaPared, matArena, matArenaPared, matArenaPared, matArenaPared]);
    suelo.position.set(60, -16, -102);
    suelo.receiveShadow = true;
    capaCercana.add(suelo);

    // Capa cercana: cactus, rocas y plantas rodadoras
    for (let x = -30; x < 150; x += aleatorio(6, 11)) {
        const cactus = crearCactus(aleatorio(2.2, 4.2));
        cactus.position.set(x, -1, aleatorio(-7, -13));
        cactus.rotation.y = aleatorio(-0.6, 0.6);
        capaCercana.add(cactus);
    }
    for (let x = -30; x < 150; x += aleatorio(4, 8)) {
        const roca = piezaEscalada(GEO_ROCA, matRoca, x, -1, aleatorio(-5, -14),
            aleatorio(0.6, 1.4), aleatorio(0.4, 0.8), aleatorio(0.5, 1));
        roca.rotation.y = aleatorio(0, Math.PI);
        capaCercana.add(roca);
    }
    for (let i = 0; i < 3; i++) crearRodadora(aleatorio(-10, 30), aleatorio(-8, -11));

    // Dunas: medias esferas muy achatadas
    for (let x = -60; x < 170; x += aleatorio(7, 12)) {
        capaDunas.add(piezaEscalada(GEO_DUNA, matDuna, x, -1, aleatorio(-18, -30),
            aleatorio(5, 10), aleatorio(1.2, 3), aleatorio(3, 5)));
    }

    // Mesetas: cilindros de pocos lados (más anchos abajo) con una franja oscura arriba
    for (let x = -80; x < 160; x += aleatorio(14, 24)) {
        const ancho = aleatorio(3, 6), alto = aleatorio(5, 11);
        const meseta = new THREE.Group();
        meseta.add(pieza(new THREE.CylinderGeometry(ancho * 0.8, ancho, alto * 0.88, 7), matMeseta, 0, alto * 0.44, 0));
        meseta.add(pieza(new THREE.CylinderGeometry(ancho * 0.84, ancho * 0.8, alto * 0.12, 7), matMesetaCima, 0, alto * 0.94, 0));
        meseta.position.set(x, -1, aleatorio(-40, -55));
        meseta.rotation.y = aleatorio(0, Math.PI);
        capaMesetas.add(meseta);
    }

    // Nubes, altas en el cielo
    for (let x = -110; x < 170; x += aleatorio(18, 30)) {
        crearNube(x, aleatorio(13, 22), aleatorio(-55, -75));
    }

    // Montañas: conos de 6 lados, de dos tonos de violeta
    for (let x = -130; x < 190; x += aleatorio(12, 20)) {
        const radio = aleatorio(10, 18), alto = aleatorio(12, 24);
        const montana = pieza(new THREE.ConeGeometry(radio, alto, 6),
            matMontanas[Math.floor(aleatorio(0, 2))], x, -1 + alto / 2, aleatorio(-85, -105));
        montana.rotation.y = aleatorio(0, Math.PI);
        capaMontanas.add(montana);
    }
}

// ---------- Animación del fondo (se llama en cada cuadro desde animate) ----------
function actualizarDecoracion(dt) {
    // Parallax: cada capa se corre una fracción de lo que se movió la cámara
    capasFondo.forEach(capa => { capa.position.x = camera.position.x * capa.userData.parallax; });

    // El cielo siempre rodea a la cámara (así parece estar infinitamente lejos)
    cielo.position.copy(camera.position);
    sol.getWorldPosition(materialCielo.uniforms.direccionSol.value).sub(camera.position).normalize();

    // Nubes: el viento las arrastra; al salir por la derecha vuelven por la izquierda
    nubes.forEach(nube => {
        nube.position.x += nube.userData.velocidad * dt;
        if (nube.position.x > 170) nube.position.x -= 290;
    });

    // Plantas rodadoras: avanzan, giran (avanzar / radio = ángulo) y dan saltitos (|seno|)
    rodadoras.forEach(r => {
        r.fase += r.velocidad * 1.5 * dt;
        r.malla.position.x += r.velocidad * dt;
        r.malla.position.y = -1 + RADIO_RODADORA + Math.abs(Math.sin(r.fase)) * 0.8;
        r.malla.rotation.z -= (r.velocidad / RADIO_RODADORA) * dt;
        // Si quedan muy lejos de la cámara, reaparecen al otro lado
        if (r.malla.position.x > camera.position.x + 35) r.malla.position.x = camera.position.x - 35;
        if (r.malla.position.x < camera.position.x - 35) r.malla.position.x = camera.position.x + 35;
    });
}


/* =====================================================================
   17. SONIDOS (Web Audio API, sin archivos)
   Todos los sonidos se SINTETIZAN en el navegador: no hay que descargar
   nada, por eso no existe la carpeta src/audio/.
     - AudioContext: el "estudio de sonido" del navegador.
     - OscillatorNode: genera una onda (cuadrada, triangular, senoidal) = un tono.
     - Ruido blanco (valores al azar): golpes, roturas y cascos de caballo.
     - GainNode: controla el volumen. Con rampas de volumen hacemos la
       "envolvente": qué tan rápido empieza y se apaga cada sonido.
   Cadena: fuente → volumen de la nota → efectos o música → general → parlantes

   POLÍTICA DE AUTOPLAY: los navegadores no dejan sonar nada hasta que el
   usuario interactúa con la página. Por eso el AudioContext se crea recién
   con el primer clic o tecla (desbloquearAudio) o al presionar JUGAR.
   ===================================================================== */
const VOLUMEN_MUSICA = 0.3;
let audio = null;           // { ctx, general, efectos, musica, bufferRuido } (se crea con el primer gesto)
let silenciado = false;

function iniciarAudio() {
    if (audio) return;      // ya estaba creado
    const ctx = new AudioContext();
    const general = ctx.createGain();
    general.gain.value = silenciado ? 0 : 1;
    general.connect(ctx.destination);
    const efectos = ctx.createGain();
    efectos.gain.value = 0.6;
    efectos.connect(general);
    const musica = ctx.createGain();
    musica.gain.value = VOLUMEN_MUSICA;
    musica.connect(general);

    // Un segundo de ruido blanco, reutilizable por todos los sonidos de ruido
    const bufferRuido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const muestras = bufferRuido.getChannelData(0);
    for (let i = 0; i < muestras.length; i++) muestras[i] = Math.random() * 2 - 1;

    audio = { ctx, general, efectos, musica, bufferRuido };
}

// Toca un tono que empieza en el instante t (segundos del AudioContext).
// La frecuencia puede deslizarse de "frecuencia" a "frecuenciaFinal" (efecto "piu").
function tono(t, { tipo = 'square', frecuencia, frecuenciaFinal = frecuencia, duracion = 0.15,
                   volumen = 0.3, ataque = 0.01, vibrato = false, destino = audio.efectos }) {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, t);
    if (frecuenciaFinal !== frecuencia) osc.frequency.exponentialRampToValueAtTime(frecuenciaFinal, t + duracion);
    if (vibrato) {
        // Vibrato: un oscilador lento (5 Hz) mueve un poquito la frecuencia (como un silbido)
        const lfo = ctx.createOscillator();
        const profundidad = ctx.createGain();
        lfo.frequency.value = 5;
        profundidad.gain.value = frecuencia * 0.012;
        lfo.connect(profundidad).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + duracion + 0.05);
    }
    // Envolvente: sube en "ataque" segundos y se apaga suave (exponencial) hasta el final
    vol.gain.setValueAtTime(0.0001, t);
    vol.gain.exponentialRampToValueAtTime(volumen, t + ataque);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(vol).connect(destino);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
}

// Ráfaga de ruido filtrado: el filtro elige qué parte del ruido se escucha (grave o aguda)
function ruido(t, { duracion = 0.2, volumen = 0.3, filtro = 'lowpass', frecuencia = 1000, destino = audio.efectos }) {
    const ctx = audio.ctx;
    const fuente = ctx.createBufferSource();
    fuente.buffer = audio.bufferRuido;
    const nodoFiltro = ctx.createBiquadFilter();
    nodoFiltro.type = filtro;
    nodoFiltro.frequency.value = frecuencia;
    const vol = ctx.createGain();
    vol.gain.setValueAtTime(volumen, t);
    vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    fuente.connect(nodoFiltro).connect(vol).connect(destino);
    fuente.start(t, Math.random() * 0.5);   // empieza en un punto al azar: cada golpe suena distinto
    fuente.stop(t + duracion + 0.05);
}

// ---------- Efectos ligados a eventos del juego ----------
// Cada uno recibe t = "ahora" y puede programar varias notas seguidas (t + algo)
const EFECTOS = {
    saltar(t) {          // tono que sube rápido: "fiuu"
        tono(t, { frecuencia: 260, frecuenciaFinal: 720, duracion: 0.16, volumen: 0.16 });
    },
    golpe(t) {           // cabezazo contra un bloque que no se rompe
        tono(t, { tipo: 'triangle', frecuencia: 180, frecuenciaFinal: 70, duracion: 0.1, volumen: 0.45 });
    },
    romper(t) {          // los pedazos (ruido) + un "bum" grave
        ruido(t, { duracion: 0.3, volumen: 0.6, frecuencia: 1500 });
        tono(t, { frecuencia: 140, frecuenciaFinal: 40, duracion: 0.15, volumen: 0.22 });
    },
    gema(t) {            // dos notas agudas: "ti-ling" (Si5 → Mi6)
        tono(t, { frecuencia: 988, duracion: 0.08, volumen: 0.12 });
        tono(t + 0.07, { frecuencia: 1319, duracion: 0.3, volumen: 0.12 });
    },
    aplastar(t) {        // "plof": el tono cae de golpe + ruido corto
        tono(t, { frecuencia: 500, frecuenciaFinal: 90, duracion: 0.14, volumen: 0.2 });
        ruido(t, { duracion: 0.08, volumen: 0.4, frecuencia: 600 });
    },
    perderVida(t) {      // melodía que baja (Do5, Sib4, Sol4, Mi4, Do4)
        [523, 466, 392, 330, 262].forEach((f, i) =>
            tono(t + i * 0.13, { tipo: 'triangle', frecuencia: f, frecuenciaFinal: f * 0.97, duracion: 0.16, volumen: 0.45 }));
    },
    ganar(t) {           // fanfarria que sube (Do-Mi-Sol-Do) + el acorde sostenido
        const acorde = [523, 659, 784, 1047];
        acorde.forEach((f, i) => tono(t + i * 0.12, { frecuencia: f, duracion: 0.14, volumen: 0.14 }));
        acorde.forEach(f => tono(t + 0.5, { tipo: 'triangle', frecuencia: f, duracion: 1.4, volumen: 0.2 }));
    },
    gameOver(t) {        // "uá, uá, uá, uáaa" bajando de a medio tono
        [392, 370, 349].forEach((f, i) =>
            tono(t + i * 0.35, { tipo: 'triangle', frecuencia: f, frecuenciaFinal: f * 0.94, duracion: 0.32, volumen: 0.45 }));
        tono(t + 1.05, { tipo: 'triangle', frecuencia: 330, frecuenciaFinal: 290, duracion: 1.1, volumen: 0.45 });
    },
    puntoControl(t) {
        tono(t, { frecuencia: 660, duracion: 0.1, volumen: 0.13 });
        tono(t + 0.1, { frecuencia: 880, duracion: 0.25, volumen: 0.13 });
    },
    vidaExtra(t) {
        [523, 659, 784, 1047, 1319].forEach((f, i) => tono(t + i * 0.07, { frecuencia: f, duracion: 0.1, volumen: 0.12 }));
    },
};

function reproducir(nombre) {
    if (!audio) return;     // todavía no hubo interacción del usuario: silencio
    EFECTOS[nombre](audio.ctx.currentTime);
}

// ---------- Música de fondo en bucle (secuenciador) ----------
// Cada voz es una lista de pasos de corchea separados por espacios:
//   'A4' = tocar esa nota (letra + octava, '#' = sostenido)
//   '-'  = silencio        '~' = mantener la nota anterior (la alarga)
//   'x' / 'o' = (solo en "cascos") golpe agudo / grave
// Si una voz es más corta que las otras, se repite (como los cascos).
const PISTAS = {
    // Menú: lenta, guitarra punteada y un silbido solitario (Lam - Rem - Mi - Lam)
    menu: {
        tempo: 84,
        voces: [
            { instrumento: 'guitarra', notas:
                'A3 E4 A4 C5 E5 C5 A4 E4  D3 A3 D4 F4 A4 F4 D4 A3  E3 B3 E4 G#4 B4 G#4 E4 B3  A3 E4 A4 C5 E5 C5 A4 E4' },
            { instrumento: 'silbido', notas:
                'E5 ~ ~ ~ ~ ~ C5 D5  F5 ~ ~ ~ E5 ~ D5 ~  E5 ~ ~ ~ ~ ~ - -  A4 ~ ~ ~ ~ ~ ~ -' },
        ],
    },
    // Juego: galope del lejano oeste (Lam - Sol - Fa - Mi)
    juego: {
        tempo: 150,
        voces: [
            { instrumento: 'melodia', notas:
                'E5 - A5 - E5 - C5 D5  D5 - G5 - D5 - B4 C5  C5 - F5 - C5 - A4 C5  B4 - G#4 - E4 ~ ~ -  ' +
                'A4 - C5 - E5 - A5 -  G5 - F5 - D5 - B4 -  A4 - C5 - B4 - G#4 -  A4 ~ ~ - E4 - A4 -' },
            { instrumento: 'bajo', notas:
                'A2 - E3 - A2 - E3 -  G2 - D3 - G2 - D3 -  F2 - C3 - F2 - C3 -  E2 - B2 - E2 - B2 -  ' +
                'A2 - E3 - A2 - E3 -  G2 - D3 - G2 - D3 -  F2 - C3 - E2 - B2 -  A2 - E3 - A2 - E2 -' },
            { instrumento: 'cascos', notas: 'x - x o x - x o' },
        ],
    },
};

const INSTRUMENTOS = {
    guitarra: { tipo: 'triangle', volumen: 0.35 },
    silbido:  { tipo: 'sine', volumen: 0.2, ataque: 0.08, vibrato: true },
    melodia:  { tipo: 'square', volumen: 0.08 },
    bajo:     { tipo: 'triangle', volumen: 0.4 },
};

// 'A4' → 440 Hz. Cada semitono multiplica la frecuencia por 2^(1/12).
const SEMITONOS = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function frecuenciaNota(nombre) {
    const sostenido = nombre[1] === '#' ? 1 : 0;
    const octava = Number(nombre.slice(1 + sostenido));
    return 440 * Math.pow(2, (SEMITONOS[nombre[0]] + sostenido + (octava - 4) * 12) / 12);
}

const musica = { nombre: '', voces: [], tempo: 120, paso: 0, proximoPaso: 0, salida: null, intervalo: null };

// Empieza una pista (después de "retardo" segundos), reemplazando la que sonaba
function tocarMusica(nombre, retardo = 0) {
    if (!audio) return;
    detenerMusica();
    const pista = PISTAS[nombre];
    musica.nombre = nombre;
    musica.tempo = pista.tempo;
    musica.voces = pista.voces.map(v => ({ instrumento: v.instrumento, notas: v.notas.trim().split(/\s+/) }));
    musica.paso = 0;
    musica.proximoPaso = audio.ctx.currentTime + 0.1 + retardo;
    // Cada pista suena por su propio nodo de volumen: al cambiarla, también
    // podemos apagar las notas que ya estaban programadas.
    musica.salida = audio.ctx.createGain();
    musica.salida.connect(audio.musica);
    musica.intervalo = setInterval(programarMusica, 25);
}

function detenerMusica() {
    if (!musica.salida) return;
    clearInterval(musica.intervalo);
    const salida = musica.salida;
    salida.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.05);    // fundido rápido
    setTimeout(() => salida.disconnect(), 500);
    musica.salida = null;
    musica.nombre = '';
}

// Se llama cada 25 ms y programa las notas que caen en los próximos 0.15 s.
// Programar "un poquito adelante" con el reloj del AudioContext mantiene el
// ritmo exacto aunque setInterval se atrase un poco.
function programarMusica() {
    const ctx = audio.ctx;
    const duracionPaso = 60 / musica.tempo / 2;          // una corchea
    // Si nos atrasamos mucho (pestaña en segundo plano), saltamos en vez de tocar todo junto
    if (musica.proximoPaso < ctx.currentTime - 0.2) musica.proximoPaso = ctx.currentTime + 0.05;

    while (musica.proximoPaso < ctx.currentTime + 0.15) {
        const t = musica.proximoPaso;
        musica.voces.forEach(voz => {
            const n = musica.paso % voz.notas.length;
            const nota = voz.notas[n];
            if (nota === '-' || nota === '~') return;
            if (voz.instrumento === 'cascos') {
                ruido(t, { duracion: 0.05, volumen: 0.22, filtro: 'bandpass',
                           frecuencia: nota === 'x' ? 2500 : 1100, destino: musica.salida });
                return;
            }
            // Duración: este paso + todos los '~' que le siguen
            let pasos = 1;
            while (pasos < voz.notas.length && voz.notas[(n + pasos) % voz.notas.length] === '~') pasos++;
            tono(t, { ...INSTRUMENTOS[voz.instrumento], frecuencia: frecuenciaNota(nota),
                      duracion: pasos * duracionPaso, destino: musica.salida });
        });
        musica.proximoPaso += duracionPaso;
        musica.paso++;
    }
}

// Baja (true) o restaura (false) la música, p. ej. mientras suena "perder vida"
function bajarMusica(bajar) {
    if (!audio) return;
    audio.musica.gain.setTargetAtTime(bajar ? VOLUMEN_MUSICA * 0.2 : VOLUMEN_MUSICA, audio.ctx.currentTime, 0.1);
}

// En pausa o con la pestaña oculta el audio se congela (suspend) y luego sigue (resume)
function actualizarPausaAudio() {
    if (!audio) return;
    if (document.hidden || estado === 'pausa') audio.ctx.suspend();
    else audio.ctx.resume();
}
document.addEventListener('visibilitychange', actualizarPausaAudio);

// Tecla M: silenciar / activar todo el sonido
function alternarSilencio() {
    silenciado = !silenciado;
    if (audio) audio.general.gain.setTargetAtTime(silenciado ? 0 : 1, audio.ctx.currentTime, 0.02);
    mostrarAviso(silenciado ? 'SONIDO: NO' : 'SONIDO: SÍ');
}

// Primer gesto del usuario en el menú (clic o tecla): se crea el audio y
// suena la música del menú. Si el clic fue en JUGAR, iniciarJuego() pone
// directamente la música del juego.
function desbloquearAudio(e) {
    iniciarAudio();
    if (estado === 'inicio' && musica.nombre !== 'menu' && e.target !== botonJugar) tocarMusica('menu');
}
window.addEventListener('pointerdown', desbloquearAudio);
window.addEventListener('keydown', desbloquearAudio);


/* =====================================================================
   18. ARRANQUE
   Va al final: así todas las secciones anteriores ya están definidas.
   ===================================================================== */
ui.inicio.classList.remove('oculto');   // mostramos el menú de inicio
construirDecoracion();         // el desierto se arma UNA sola vez (no cambia entre partidas)
construirNivel();              // el nivel se ve de fondo en la pantalla de inicio
reaparecerJugador();
actualizarModeloJugador(0);
renderer.setAnimationLoop(animate);   // al final: todo ya está definido
