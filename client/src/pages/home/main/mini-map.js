import { View } from "react-native";

const MiniMap = ({ playerCoords, worldSize, starPosition }) => {
  const mapSize = 120; // حجم الخريطة المصغرة في الواجهة

  // اللاعب سيكون دائمًا في المركز في الخريطة المصغرة
  const playerX = mapSize / 2;
  const playerY = mapSize / 2;
  const playerZ = mapSize / 2;

  // حساب الموقع النسبي للشمس بناءً على موقع اللاعب
  const relativeStarX =
    ((starPosition.x - playerCoords.x) / worldSize) * mapSize + playerX;
  const relativeStarY =
    ((starPosition.y - playerCoords.y) / worldSize) * mapSize + playerY;
  const relativeStarZ =
    ((starPosition.z - playerCoords.z) / worldSize) * mapSize + playerZ;

  return (
    <View
      className={`absolute flex flex-row items-center justify-center gap-x-3 bottom-8 left-1/2`}
      style={{
        marginLeft: -mapSize / 2,
      }}
    >
      {/* الخريطة المصغرة */}
      <View
        style={{
          width: mapSize,
          height: mapSize,
        }}
        className={`bg-[#333] relative rounded-full opacity-60`}
      >
        {/* موقع اللاعب على الخريطة */}
        <View
          style={{
            top: playerZ - 1, // نقم بطرح 1 لتكون في المركز
            left: playerX - 1, // نقم بطرح 1 لتكون في المركز
          }}
          className={`absolute w-2 h-2 bg-red-500 rounded-full`}
        ></View>
        {/* موقع النجمة نسبة لللاعب */}
        <View
          style={{
            top: relativeStarZ - 1,
            left: relativeStarX - 1,
          }}
          className={`absolute w-2 h-2 bg-yellow-500 rounded-full`}
        ></View>
      </View>

      {/* عمود البعد Z */}
      <View
        className={`w-3 rounded-2xl bg-[#333] relative opacity-60`}
        style={{
          height: mapSize,
        }}
      >
        {/* موقع اللاعب على البعد Z */}
        <View
          className={`absolute left-0 w-full h-1 bg-red-500`}
          style={{
            bottom: playerY - 0.5,
          }}
        ></View>
        {/* موقع النجمة نسبة لللاعب على البعد Z */}
        <View
          className={`absolute left-0 w-full h-1 bg-yellow-500`}
          style={{
            bottom: relativeStarY - 0.5,
          }}
        ></View>
      </View>
    </View>
  );
};

export default MiniMap;
