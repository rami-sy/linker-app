function generateLevelThresholds() {
    const thresholds = [];
    let increment = 5;
    
    for (let i = 1; i <= 200; i++) {
      thresholds.push(increment);
      
      // بعد كل مستوى، تزداد الزيادة بشكل تدريجي
      if (i < 10) {
        increment += 3; // زيادة طفيفة في البداية
      } else if (i < 20) {
        increment += 10; // زيادة أكبر بعد المستوى 10
      } else if (i < 50) {
        increment += 25; // زيادة كبيرة بعد المستوى 20
      } else if (i < 100) {
        increment += 50; // زيادة أكبر بعد المستوى 50
      } else {
        // بعد المستوى 100، تكون القيمة ثابتة
        increment = 4000;
      }
    }
  
    return thresholds;
  }
  
  const levelThresholds = generateLevelThresholds();
  
  console.log(JSON.stringify(levelThresholds, null, 2));
  