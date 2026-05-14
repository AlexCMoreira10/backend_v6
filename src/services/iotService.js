import { db } from '../config/firebase.js';

const collection = db.collection('iot');

export const salvarDadosIoT = async (dados) => {
  const docRef = await collection.add(dados);
  return {
    id: docRef.id,
    ...dados
  };
};


export const listarDadosIoT = async () => {
  // Busca todos os registros
  const dados = await collection.get();
  return dados;
  // Retorna os dados encontrados
  //res.status(200).json({
  //  message: 'Dados do IoT exibidos com sucesso!',
  //  dados: dados
  //});
};