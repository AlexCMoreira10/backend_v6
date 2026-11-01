import { buscarSeboPorId } from '../services/seboService.js';
import {
  criarModeloImportacaoLivros,
  criarRelatorioImportacaoLivros,
  lerPlanilhaImportacaoLivros,
  normalizarLinhaImportacaoLivro
} from '../utils/bookImport.js';
import { criarLivroImportadoSebo } from '../services/livroCreationService.js';

const MIME_PLANILHA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const enviarPlanilha = (res, conteudo, nome) => res
  .type(MIME_PLANILHA)
  .set('Content-Disposition', `attachment; filename="${nome}"`)
  .send(Buffer.from(conteudo));

export const baixarModeloAnunciosEmMassa = async (req, res) => {
  try {
    const conteudo = await criarModeloImportacaoLivros();
    return enviarPlanilha(res, conteudo, 'modelo-anuncios-livros.xlsx');
  } catch (error) {
    console.error('Erro ao gerar modelo de anúncios em massa:', error);
    return res.status(500).json({ erro: 'Não foi possível gerar o modelo da planilha' });
  }
};

export const importarAnunciosEmMassa = async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ erro: 'Envie uma planilha Excel .xlsx válida' });
  }

  let linhas;
  try {
    linhas = await lerPlanilhaImportacaoLivros(req.body);
  } catch (error) {
    return res.status(400).json({ erro: error.message || 'Não foi possível ler a planilha' });
  }

  try {
    const sebo = await buscarSeboPorId(req.seboId);
    if (!sebo) return res.status(404).json({ erro: 'Cadastro de sebo não encontrado' });

    const resultados = [];
    for (const linha of linhas) {
      if (linha.erro) {
        resultados.push({
          numeroLinha: linha.numeroLinha,
          valores: linha.valores,
          erro: linha.erro
        });
        continue;
      }

      try {
        const dados = normalizarLinhaImportacaoLivro(linha.valores);
        const livro = await criarLivroImportadoSebo({
          seboId: req.seboId,
          seboNome: sebo.nome,
          dados,
          geocodeSebo: sebo.geocode
        });
        resultados.push({
          numeroLinha: linha.numeroLinha,
          valores: dados,
          idLivro: livro.id
        });
      } catch (error) {
        if (error.status !== 400) {
          console.error(`Erro ao cadastrar o livro da linha ${linha.numeroLinha}:`, error);
        }
        resultados.push({
          numeroLinha: linha.numeroLinha,
          valores: linha.valores,
          erro: error.status === 400
            ? error.message
            : 'Erro interno ao cadastrar este livro; tente novamente.'
        });
      }
    }

    const relatorio = await criarRelatorioImportacaoLivros(resultados);
    const criados = resultados.filter((resultado) => resultado.idLivro).length;
    const rejeitados = resultados.length - criados;
    res.set('X-Livros-Processados', String(resultados.length));
    res.set('X-Livros-Cadastrados', String(criados));
    res.set('X-Livros-Rejeitados', String(rejeitados));
    return enviarPlanilha(res, relatorio, 'resultado-anuncios-livros.xlsx');
  } catch (error) {
    console.error('Erro ao processar anúncios em massa:', error);
    return res.status(500).json({ erro: 'Não foi possível processar a planilha de anúncios' });
  }
};
