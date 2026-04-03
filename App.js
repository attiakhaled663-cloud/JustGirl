import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, ScrollView, 
  TouchableOpacity, Switch, Alert, Modal 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function KickBotApp() {
  const [activeTab, setActiveTab] = useState('accounts'); // accounts | channels | settings
  const [accounts, setAccounts] = useState([]);
  const [channels, setChannels] = useState([]);
  const [shareCode, setShareCode] = useState('');
  const [isModalVisible, setModalVisible] = useState(false);

  // تحميل البيانات عند فتح التطبيق
  useEffect(() => {
    const loadData = async () => {
      const savedAccounts = await AsyncStorage.getItem('@accounts');
      const savedChannels = await AsyncStorage.getItem('@channels');
      if (savedAccounts) setAccounts(JSON.parse(savedAccounts));
      if (savedChannels) setChannels(JSON.parse(savedChannels));
    };
    loadData();
  }, []);

  // حفظ البيانات تلقائياً عند أي تغيير
  useEffect(() => {
    AsyncStorage.setItem('@accounts', JSON.stringify(accounts));
    AsyncStorage.setItem('@channels', JSON.stringify(channels));
  }, [accounts, channels]);

  // --- ميزة إضافة حساب وجلب الاسم تلقائياً عبر التوكن ---
  const addAccount = async (token) => {
    try {
      // محاكاة طلب لـ Kick API لجلب بيانات الحساب
      const response = await fetch('https://kick.com/api/v1/user', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const userData = await response.json();
      const newAcc = {
        id: Date.now(),
        token: token,
        username: userData.username || "Account_" + accounts.length,
        isExpired: false,
        status: 'متوقف'
      };
      setAccounts([...accounts, newAcc]);
    } catch (e) {
      // في حال فشل التوكن يظهر كـ "منتهي"
      const newAcc = { id: Date.now(), token, username: "حساب غير معروف", isExpired: true, status: 'توكن منتهي' };
      setAccounts([...accounts, newAcc]);
    }
  };

  // --- ميزة إضافة قناة مع فحص التكرار ---
  const addChannel = (name) => {
    if (channels.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      Alert.alert("خطأ", "القناة موجودة بالفعل في القائمة");
      return;
    }
    const newChan = {
      id: Date.now(),
      name: name,
      messages: "",
      speed: "10",
      isRandom: false,
      isLive: false,
      active: true,
      maxSends: "0" // 0 يعني لا نهائي
    };
    setChannels([...channels, newChan]);
  };

  // --- ميزة كود المشاركة (Export JSON) ---
  const generateShareCode = () => {
    const data = { channels, accounts };
    const code = btoa(JSON.stringify(data)); // تشفير البيانات لكود نصي
    setShareCode(code);
    setModalVisible(true);
  };

  // --- ميزة استعادة البيانات من كود ---
  const importData = (code) => {
    try {
      const decoded = JSON.parse(atob(code));
      if (decoded.channels) setChannels(decoded.channels);
      if (decoded.accounts) setAccounts(decoded.accounts);
      Alert.alert("نجاح", "تم استعادة البيانات المحددة بنجاح");
    } catch (e) {
      Alert.alert("خطأ", "الكود غير صحيح");
    }
  };

  return (
    <View style={styles.container}>
      {/* Header التبويبات */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setActiveTab('accounts')}>
          <Text style={[styles.tabText, activeTab === 'accounts' && styles.activeTab]}>الحسابات</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('channels')}>
          <Text style={[styles.tabText, activeTab === 'channels' && styles.activeTab]}>القنوات</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('settings')}>
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTab]}>كود المشاركة</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'accounts' && (
          <View>
            <TouchableOpacity style={styles.addButton} onPress={() => addAccount("TOKEN_HERE")}>
              <Text style={{color:'#000', fontWeight:'bold'}}>+ إضافة توكن</Text>
            </TouchableOpacity>
            {accounts.map(acc => (
              <View key={acc.id} style={styles.card}>
                <Text style={styles.cardTitle}>{acc.username}</Text>
                <Text style={{color: acc.isExpired ? 'red' : '#00e701'}}>{acc.status}</Text>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'channels' && (
          <View>
             <TextInput 
              placeholder="اكتب اسم القناة..." 
              placeholderTextColor="#888"
              style={styles.input}
              onSubmitEditing={(e) => addChannel(e.nativeEvent.text)}
            />
            {channels.map(chan => (
              <View key={chan.id} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.cardTitle}>{chan.name}</Text>
                  <Text style={{color: chan.isLive ? '#00e701' : '#fff'}}>{chan.isLive ? "● مباشر" : "○ أوفلاين"}</Text>
                </View>
                
                <TextInput 
                  placeholder="الرسائل (سطر لكل رسالة)..."
                  multiline
                  style={styles.textArea}
                  onChangeText={(txt) => {
                    chan.messages = txt;
                    setChannels([...channels]);
                  }}
                />

                <View style={styles.row}>
                  <Text style={styles.label}>السرعة (ثانية):</Text>
                  <TextInput 
                    keyboardType="numeric" 
                    style={styles.smallInput} 
                    defaultValue={chan.speed}
                    onChangeText={(val) => chan.speed = val}
                  />
                  <Text style={styles.label}>عشوائي:</Text>
                  <Switch 
                    value={chan.isRandom} 
                    onValueChange={(val) => {
                      chan.isRandom = val;
                      setChannels([...channels]);
                    }} 
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'settings' && (
          <View style={styles.card}>
            <Text style={styles.label}>استعادة البيانات من كود:</Text>
            <TextInput 
              style={styles.input} 
              placeholder="ضع الكود هنا..."
              onChangeText={(t) => setShareCode(t)}
            />
            <TouchableOpacity style={styles.addButton} onPress={() => importData(shareCode)}>
              <Text style={{color:'#000'}}>تطبيق الكود</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addButton, {marginTop:10}]} onPress={generateShareCode}>
              <Text style={{color:'#000'}}>توليد كود مشاركة جديد</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* زر التشغيل الكبير (كما في الفيديو) */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.mainStartBtn}>
          <Text style={styles.startBtnText}>تشغيل المحدد (24/7)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0b0b' },
  header: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: '#1a1a1a' },
  tabText: { color: '#888', fontSize: 16, fontWeight: 'bold' },
  activeTab: { color: '#00e701', borderBottomWidth: 2, borderBottomColor: '#00e701' },
  content: { padding: 15 },
  card: { backgroundColor: '#1a1a1a', padding: 15, borderRadius: 10, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#00e701' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  addButton: { backgroundColor: '#00e701', padding: 10, borderRadius: 5, alignItems: 'center', marginBottom: 15 },
  input: { backgroundColor: '#222', color: '#fff', padding: 10, borderRadius: 5, marginBottom: 10 },
  textArea: { backgroundColor: '#111', color: '#fff', padding: 10, borderRadius: 5, height: 80, marginTop: 10, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  label: { color: '#aaa' },
  smallInput: { backgroundColor: '#222', color: '#00e701', width: 50, textAlign: 'center', borderRadius: 5 },
  footer: { padding: 20, backgroundColor: '#0b0b0b' },
  mainStartBtn: { backgroundColor: '#00e701', padding: 15, borderRadius: 10, alignItems: 'center' },
  startBtnText: { color: '#000', fontWeight: 'bold', fontSize: 18 }
});
