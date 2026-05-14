import { salvarDadosIoT , listarDadosIoT } from '../services/iotService.js';

export const salvarDadosIoTController = async (req, res) => {
  try {
    const { temperatura, anguloServo, mensagemLCD } = req.body;
    
    const novoRegistro = {temperatura, anguloServo, mensagemLCD};

    novoRegistro.criadoEm = new Date();

    // Lógica para salvar os dados do IoT
    //res.status(201).json({ message: 'Dados do IoT salvos com sucesso!', temperatura, anguloServo, mensagemLCD });

    const resultado = await salvarDadosIoT(novoRegistro);
    return res.status(201).json(resultado);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const exibirDadosIoTController = async (req, res) => {
    try {
        const dados = await listarDadosIoT();
        return res.status(200).json(dados);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};