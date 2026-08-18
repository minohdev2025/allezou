# Tus datos en Allezou

Esta página explica qué guarda Allezou, por qué, durante cuánto tiempo, y quién puede verlo.
Está escrita para leerse entera: si algo no queda claro, es un fallo de esta página, no de tu
atención.

## Quién es responsable

**Michael Urbina**, domiciliado en Petit-Lancy.

Para cualquier pregunta o solicitud:

> [contact@allezou.ch](mailto:contact@allezou.ch)  
> Michael Urbina

Este tratamiento está sujeto a la ley federal suiza de protección de datos (nLPD).

## Lo que Allezou guarda

Allezou trata datos personales, algunos de los cuales son de niños. Por eso existe esta
página.

| Dato | Por qué existe | Durante cuánto tiempo | Quién lo ve |
|---|---|---|---|
| Tu correo electrónico | Es tu única forma de conectarte: Allezou no tiene contraseña | Mientras exista tu cuenta | Solo tú. Nunca se muestra a los demás miembros |
| El nombre que eliges mostrar | Para que los demás te reconozcan. Lo escribes libremente: «Sophie», «Mamá de Léa», lo que tú quieras | Mientras exista tu cuenta | Los miembros de tus círculos |
| El **nombre de pila** de tus hijos, y nada más | Para decir quién está presente en una salida: «estamos en el parque con Matéo» | Mientras lo mantengas declarado | Los miembros de tus círculos, cuando declaras presente al niño |
| Tus círculos y quién forma parte de ellos | Es el corazón del producto | Mientras exista el círculo | Los miembros del círculo en cuestión |
| El nombre con el que ves un círculo, si es distinto del original | Para que «Clase 4P» pueda leerse «Clase de Jules» en tu pantalla | Mientras lo conserves | Solo tú. Los demás miembros ven el nombre original |
| Qué hijo está relacionado con qué círculo | Para que una salida sin el mayor no se envíe a su clase | Mientras lo conserves | Tú, y el otro padre o madre del niño si lo tiene. Los demás miembros del círculo no lo ven |
| Tus salidas: un lugar elegido de una lista, una hora de fin, y opcionalmente una nota de 140 caracteres | Es lo que compartes | **Se borra 24 horas después de su hora de fin** | Solo los círculos que elegiste al publicarla |
| Tus inscripciones a las actividades de la agenda | Para que otras familias sepan que su hijo se encontrará con alguien | **Se borra 24 horas después de que acabe la actividad**, igual que una salida | Solo los círculos que elegiste |
| Tus ajustes de notificación | Para molestarte solo cuando tú lo has pedido | Mientras exista tu cuenta | Solo tú |
| Las palabras que vigilas en la agenda: «piscina», «judo» | Para avisarte cuando se publica una actividad que contenga alguna | Mientras las conserves | Solo tú. No se muestran a nadie y no sirven para nada más |
| La dirección técnica de tu teléfono para las notificaciones | Para enviarte las notificaciones | Mientras las aceptes | Nadie: es un identificador técnico |
| Un registro de los cambios de permisos (quién hizo entrar a quién en un círculo, quién excluyó a quién) | Para poder entender un problema de seguridad | **12 meses** | El responsable, en caso de incidente |

## Lo que Allezou no guarda

Cada una de estas ausencias se puede comprobar en el código.

- **Ninguna contraseña.** No existe en ningún sitio, así que ninguna puede filtrarse.
- **Ninguna posición GPS, nunca.** Una salida es un lugar que eliges de una lista, con una
  hora de fin. Allezou nunca le pide su posición a tu teléfono, ni cuando la aplicación está
  abierta, ni en segundo plano.
- **Ningún historial de desplazamientos.** Una salida pasada se borra, no se archiva. Ni
  siquiera el responsable puede reconstruir dónde estuvo una familia el mes pasado, ni
  siquiera en forma de estadística.
- **Ninguna mensajería.** No hay chats, ni mensajes privados, ni comentarios.
- **Ninguna herramienta de medición de audiencia.** Nada de Google Analytics, nada de píxeles
  publicitarios, nada de rastreadores de terceros.
- **Ninguna venta, ningún uso comercial compartido.** Tus datos no se transmiten a nadie.
- **De tus hijos, nada más que un nombre de pila.** Los miembros de un círculo ya conocen a
  los niños de los que se habla, la aplicación no tiene nada que añadir. Sin apellidos, **sin
  edad ni fecha de nacimiento**, sin foto, sin género, sin colegio, sin clase, sin datos de
  salud. El campo «año de nacimiento» existió durante el diseño, y se eliminó por falta de un
  uso que lo justificara.

## Quién ve qué, exactamente

Es el punto más importante, y obedece a una sola regla:

> **Una persona ve tu salida si y solo si, en el momento en que mira, es miembro de uno de
> los círculos a los que dirigiste esa salida, y tú no has cortado el vínculo con ella.**

De ahí se desprende:

- Quien **sale de un círculo** deja de ver sus salidas de inmediato.
- Quien **no está en el círculo** no ve nada, y ni siquiera se entera de quién forma parte de
  él.
- Puedes **desmarcar a una persona** dentro de un círculo. Esa persona deja de ver tus
  salidas, y tú dejas de ver las suyas. Nada se lo indica.
- Cuando varias familias se unen a una misma salida, **en la lista solo ves a las personas
  con quienes ya compartes un círculo**. Una familia que viene por el vecindario no le
  aparece a un padre o madre de la clase que no la conoce.
- Las **notificaciones** siguen exactamente la misma regla: no se te puede avisar de algo
  que no verías en la pantalla. Y el mensaje enviado a tu teléfono no dice ni quién ni dónde,
  solo el nombre del círculo, para que una pantalla bloqueada sobre una mesa no cuente nada.
- Las **alertas de la agenda** son distintas, porque la agenda es pública: todo el mundo ve
  las mismas actividades. Ahí lo que se calcula no es quién tiene derecho a saberlo, sino
  quién ha pedido saberlo. El mensaje nombra entonces la palabra que vigilas, que es tuya, y
  nunca el título de la actividad.

Esta regla está escrita en un único lugar del código, y verificada por una serie de pruebas
que enumeran los casos uno por uno. Es una demostración, que se puede mostrar bajo petición.

## Dónde están los datos

En servidores situados **en Suiza**. No salen del país.

Tres excepciones técnicas, que no afectan a ningún dato personal:

- la agenda se nutre de sitios web públicos de Ginebra (la Ciudad de Ginebra, los
  municipios);
- las páginas de esos sitios que no publican una agenda estructurada las lee un servicio de
  inteligencia artificial para extraer las fechas. **Solo se le envían páginas web
  públicas**, nunca un dato que te concierna a ti. Lo que extrae se compara después con la
  página de origen: una fecha, un título o un lugar que no se encuentre ahí no aparece en la
  agenda y espera una comprobación manual;
- la dirección de un parque o una sala se envía una vez a OpenStreetMap, para conocer sus
  coordenadas y que el enlace a un mapa caiga en el punto correcto. Es la dirección de un
  lugar público, enviada desde nuestro servidor. **Nunca la tuya, y nunca lo que consultas**:
  tu teléfono no contacta con nadie más que con nosotros — con una excepción, que activas
  tú: el mapa, justo debajo.

## El mapa

La agenda y «Salimos» ofrecen un mapa de los lugares. Viene de Google Maps — es el mapa que
la mayoría de los padres y madres ya saben leer — y un fondo de mapa cargado por defecto
sería un rastreador de terceros, justo lo que esta página excluye. Por eso obedece a una
regla sencilla: **nada sale hacia Google sin un gesto de tu parte**.

- **Mientras no pidas el mapa, Google no ve nada.** No se carga junto con la página: nada
  sale hasta que tocas «Ver en el mapa».
- **En el momento en que lo pides**, tu navegador descarga el mapa desde Google, como si
  abrieras Google Maps directamente. Google ve entonces la zona mostrada — lugares públicos
  de Ginebra — pero nunca quién mira qué lista: no averigua quién eres en Allezou, ni qué
  salida o actividad estabas consultando, ni desde qué página vienes.
- Los enlaces ↗ situados junto a los lugares siguen la misma regla: abren Google Maps en el
  momento en que los tocas, nunca antes.
- **Tu posición nunca entra en juego.** El mapa muestra lugares, no a ti. Allezou nunca le
  pide su posición a tu teléfono — el mapa no cambia nada de eso, y el navegador se lo
  impediría de todas formas. Así que tu posición no se envía a ningún sitio: ni a Google, ni
  a Allezou.

## Tus derechos

En cualquier momento puedes:

- **ver** todos los datos que te conciernen;
- **corregir** lo que sea incorrecto;
- **eliminar** tu cuenta, lo que borra tus datos;
- **retirar** a un hijo, lo que borra su nombre de pila;
- **pedir explicaciones** sobre cualquier punto de esta página.

Escribe a [contact@allezou.ch](mailto:contact@allezou.ch). También tienes derecho a
dirigirte al Comisionado Federal de Protección de Datos y Transparencia de Suiza.

## Si esta página cambia

Cualquier modificación se te anunciará en la aplicación antes de entrar en vigor. Una
modificación que ampliara lo que se recoge o quién puede verlo nunca se aplicará en
silencio.

---

*Última actualización: 16 de agosto de 2026.*
